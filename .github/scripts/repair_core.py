#!/usr/bin/env python3
"""Trusted shared repair contract. Run the version committed on protected main.

The workflow specifies the policy file from main. Application/test code in a PR
must never be allowed to modify this script or its policy for a trusted job.
"""
import argparse
import fnmatch
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import xml.etree.ElementTree as ET


def fail(message):
    raise SystemExit(message)


def load_policy(path):
    policy = json.loads(Path(path).read_text(encoding='utf-8'))
    if policy.get('schema_version') != 1:
        fail('Unknown repair policy version')
    command = policy.get('test_command')
    if not isinstance(command, list) or not command or not all(isinstance(c, str) and c for c in command):
        fail('The test command must be a nonempty argument vector')
    for key in ('test_file_globs', 'protected_globs', 'implementation_edit_globs'):
        if not isinstance(policy.get(key), list) or not policy[key]:
            fail(f'Invalid {key} in repair policy')
    if not isinstance(policy.get('test_report_glob'), str) or not policy['test_report_glob']:
        fail('A JUnit test_report_glob is required')
    for key in ('max_repair_attempts', 'max_test_files_per_repair', 'max_test_delta_lines'):
        if not isinstance(policy.get(key), int) or policy[key] < 1:
            fail(f'Invalid {key} in repair policy')
    setup = policy.get('pre_test_commands', [])
    if not isinstance(setup, list) or any(not isinstance(argv, list) or not argv or
                                          not all(isinstance(part, str) and part for part in argv)
                                          for argv in setup):
        fail('pre_test_commands must be an array of nonempty argument vectors')
    return policy


def path_matches(path, globs):
    path = path.replace('\\', '/')
    if path.startswith('/') or path.startswith('../') or '/../' in path or path == '..':
        return False
    return any(fnmatch.fnmatchcase(path, p) for p in globs)


def test_files(repo, policy):
    out = []
    for p in repo.rglob('*'):
        if p.is_file():
            relative = p.relative_to(repo).as_posix()
            if path_matches(relative, policy['test_file_globs']):
                out.append(relative)
    return sorted(out)


def extract_test_paths(message, files):
    # Correlate the runner stack trace against actual test files in the PR;
    # never infer a new path or trust a path emitted only by the model.
    canonical = message.replace('\\', '/')
    matches = [p for p in files if p in canonical]
    return sorted(matches)


def parse_junit(repo, policy, report_path=None):
    reports = [Path(report_path)] if report_path else sorted(repo.glob(policy['test_report_glob']))
    if not reports:
        fail('No JUnit report was produced; environment/test-runner failure requires investigation')
    files = test_files(repo, policy)
    cases = []
    failures = []
    keys = set()
    for report in reports:
        try:
            root = ET.parse(report).getroot()
        except ET.ParseError as exc:
            fail('Invalid JUnit XML: ' + str(exc))
        for case in root.iter('testcase'):
            name = case.get('name', '')
            classname = case.get('classname', '')
            label = classname + '::' + name
            if not name:
                fail('JUnit testcase is missing name')
            # Duplicate names may be legitimate; the stable duplicate occurrence
            # index distinguishes them without assuming an application format.
            suffix = sum(1 for c in cases if c['label'] == label)
            key = label + '#' + str(suffix)
            if key in keys:
                fail('Duplicate JUnit case identifier')
            keys.add(key)
            cases.append({'id': key, 'label': label})
            for defect in list(case.findall('failure')) + list(case.findall('error')):
                detail = (defect.get('message', '') + '\n' + (defect.text or ''))[:10000]
                test_paths = extract_test_paths(detail, files)
                # An optional runner-supplied file is only accepted when it
                # resolves to an actual file matching the trusted policy.
                attr_file = case.get('file', '').replace('\\', '/')
                if attr_file in files and attr_file not in test_paths:
                    test_paths.append(attr_file)
                failures.append({'id': key, 'name': name,
                                 'test_paths': sorted(test_paths),
                                 'details': detail,
                                 'signature': re.sub(r'(?m)^\s+at\s+.+$', '', detail).strip()[:4000]})
    if not cases:
        fail('No JUnit test cases found')
    return {'tests': cases, 'failures': failures}


def run_tests(args):
    repo = Path(args.repo).resolve()
    policy = load_policy(args.policy)
    junit_output = str(Path(args.output).resolve().parent / 'runner-results.xml')
    template = policy['test_report_glob']
    if template == '{junit_report}':
        Path(junit_output).unlink(missing_ok=True)
    else:
        # The approved adapter may emit many reports (e.g. Maven Surefire).
        # Remove only untracked/ignored previous reports to avoid stale pass/fail
        # evidence. Refuse to delete any tracked source or test fixture.
        for report in repo.glob(template):
            if not report.is_file() or report.is_symlink():
                fail('Unsafe test report path')
            relative = report.relative_to(repo).as_posix()
            if subprocess.run(['git','ls-files','--error-unmatch','--',relative],
                              cwd=repo,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode == 0:
                fail('Refusing to remove a tracked JUnit report')
            report.unlink()
    command = [part.replace('{junit_report}', junit_output) for part in policy['test_command']]
    env = os.environ.copy()
    for key in tuple(env):
        if key.upper() in ('GH_TOKEN','GITHUB_TOKEN','COPILOT_GITHUB_TOKEN','COPILOT_ASSIGN_TOKEN') or 'SECRET' in key.upper() or 'TOKEN' in key.upper():
            env.pop(key, None)
    for setup in policy.get('pre_test_commands', []):
        setup_command = [part.replace('{junit_report}',junit_output) for part in setup]
        check = subprocess.run(setup_command,cwd=repo,env=env,
                               capture_output=True,text=True,errors='replace',timeout=args.timeout)
        if check.returncode:
            Path(args.log).write_text((check.stdout+'\n'+check.stderr)[-50000:])
            fail('Test environment setup failed; investigate infrastructure (no repair authorized)')
    result = subprocess.run(command, cwd=repo, env=env,
                            capture_output=True, text=True, errors='replace', timeout=args.timeout)
    Path(args.log).write_text((result.stdout + '\n' + result.stderr)[-50000:], encoding='utf-8')
    summary = parse_junit(repo, policy, report_path=junit_output if template=='{junit_report}' else None)
    summary['exit_code'] = result.returncode
    # Test process failure with no failed case is an infrastructure failure.
    if result.returncode != 0 and not summary['failures']:
        fail('Test runner failed without JUnit test failures; investigate infrastructure')
    if result.returncode == 0 and summary['failures']:
        fail('Test reporter and process exit status disagree')
    Path(args.output).write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"Recorded {len(summary['tests'])} test cases, {len(summary['failures'])} failures, exit {result.returncode}")


def validate_triage(args):
    observed = json.loads(Path(args.observed).read_text())
    claims = json.loads(Path(args.claims).read_text())
    if claims.get('schema_version') != 2 or not isinstance(claims.get('failures'), list):
        fail('Agent response does not follow triage schema v2')
    expected = {f['id']: f for f in observed['failures']}
    claimed = claims['failures']
    if len(claimed) != len(expected) or {f.get('id') for f in claimed} != set(expected):
        fail('Triage must classify every reproduced failed test exactly once')
    by_id = {f['id']: f for f in claimed}
    normalized = []
    valid = {'TEST_DEFECT', 'IMPLEMENTATION_DEFECT', 'INCONCLUSIVE'}
    for failure_id, actual in expected.items():
        item = by_id[failure_id]
        kind = item.get('classification')
        confidence = item.get('confidence')
        evidence = item.get('evidence')
        requirement = item.get('requirement')
        guidance = item.get('repair_guidance')
        # Deterministic fail-closed handling is per failure, not per suite.
        if (kind not in valid or confidence != 'HIGH' or
                not isinstance(evidence, str) or len(evidence.strip()) < 25 or
                not isinstance(requirement, str) or len(requirement.strip()) < 4 or
                not isinstance(guidance, str) or len(guidance.strip()) < 15):
            kind = 'INCONCLUSIVE'
            confidence = 'LOW'
        # A TEST_DEFECT is automatically repairable only if the failing test
        # resolves to one or more real test files under an approved policy.
        if kind == 'TEST_DEFECT' and not actual['test_paths']:
            kind = 'INCONCLUSIVE'
            confidence = 'LOW'
        normalized.append({'id': failure_id, 'name': actual['name'],
                           'test_paths': actual['test_paths'],
                           'classification': kind, 'confidence': confidence,
                           'requirement': str(requirement or '')[:1000],
                           'evidence': str(evidence or '')[:3000],
                           'repair_guidance': str(guidance or '')[:1400]})
    tests = [f for f in normalized if f['classification'] == 'TEST_DEFECT']
    implementation = [f for f in normalized if f['classification'] == 'IMPLEMENTATION_DEFECT']
    # Repair test defects first; the next revision is retested/retriaged before
    # an implementation repair can act on the remaining failures.
    route = ('ALL_PASS' if not normalized else 'TEST_REPAIR' if tests else
             'IMPLEMENTATION_REPAIR' if implementation else 'HUMAN_REVIEW')
    policy = load_policy(args.policy)
    if route == 'TEST_REPAIR':
        paths = {p for item in tests for p in item['test_paths']}
        if len(paths) > policy['max_test_files_per_repair']:
            route = 'HUMAN_REVIEW'
    result = {'schema_version': 2, 'sha': args.sha, 'route': route,
              'failures': normalized}
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Triage validated: {len(tests)} test, {len(implementation)} implementation, '+
          f'{len(normalized)-len(tests)-len(implementation)} inconclusive; route {route}')


def assert_scope(args):
    policy = load_policy(args.policy)
    decision = json.loads(Path(args.decision).read_text())
    targets = {p for f in decision['failures'] if f['classification'] == 'TEST_DEFECT'
               for p in f['test_paths']}
    if not targets or decision['route'] != 'TEST_REPAIR':
        fail('No authorized test-defect targets')
    repo = Path(args.repo).resolve()
    changed = subprocess.check_output(['git', '-C', str(repo), 'diff', '--name-only'], text=True).splitlines()
    changed += subprocess.check_output(['git', '-C', str(repo), 'ls-files', '--others', '--exclude-standard'], text=True).splitlines()
    changed = sorted(set(changed))
    if not changed or not set(changed) <= targets:
        fail('Repair changed unauthorized files: '+repr(changed)+'; targets '+repr(sorted(targets)))
    if any(path_matches(p, policy['protected_globs']) or not path_matches(p, policy['test_file_globs']) for p in changed):
        fail('Repair touched protected or non-test paths')
    diff = subprocess.check_output(['git', '-C', str(repo), 'diff', '--unified=0', '--', *changed], text=True)
    deleted = [line for line in diff.splitlines() if line.startswith('-') and not line.startswith('---')]
    added = [line for line in diff.splitlines() if line.startswith('+') and not line.startswith('+++')]
    if len(deleted) + len(added) > policy['max_test_delta_lines']:
        fail('Repair exceeds configured size limit')
    # This check is deliberately language-agnostic. It does not claim to prove
    # semantic equivalence of assertions; independent review is mandatory.
    if any(re.search(r'(?i)\b(?:skip|todo|xfail|pending|test\.only|test\.skip)\b', x) for x in added):
        fail('Repair introduced test-disabling syntax; human review required')
    Path(args.output).write_text(json.dumps({'changed':changed,'targets':sorted(targets)}), encoding='utf-8')
    print('Permitted changed test files:', changed)


def compare_tests(args):
    before = json.loads(Path(args.before).read_text())
    after = json.loads(Path(args.after).read_text())
    original_cases = {c['id'] for c in before['tests']}
    current_cases = {c['id'] for c in after['tests']}
    if not original_cases <= current_cases:
        fail('Repair removed or renamed existing tests; human review required')
    before_fails = {f['id'] for f in before['failures']}
    after_fails = {f['id'] for f in after['failures']}
    if not after_fails <= before_fails:
        fail('Repair introduced new failing tests')
    decision = json.loads(Path(args.decision).read_text())
    targeted = {f['id'] for f in decision['failures'] if f['classification'] == 'TEST_DEFECT'}
    resolved = (before_fails - after_fails) & targeted
    before_signatures = {f['id']:f.get('signature',f.get('details','')) for f in before['failures']}
    after_signatures = {f['id']:f.get('signature',f.get('details','')) for f in after['failures']}
    # One testcase may contain multiple distinct faults. A fixture correction
    # can reveal another fault while the same test remains red; in that case
    # publish only after the independent auditor confirms the changed cause.
    changed_cause = {f for f in (before_fails & after_fails & targeted)
                     if before_signatures[f] != after_signatures[f]}
    if not resolved and not changed_cause:
        fail('No independently classified TEST_DEFECT was resolved or changed cause')
    Path(args.output).write_text(json.dumps({'resolved':sorted(resolved),
                  'changed_cause':sorted(changed_cause),
                  'remaining':sorted(after_fails)}), encoding='utf-8')
    print('Resolved:', sorted(resolved), 'Changed cause:',sorted(changed_cause),
          'Remaining:', sorted(after_fails))


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest='action', required=True)
    run = sub.add_parser('run-tests')
    for opt in ('policy', 'repo', 'output', 'log'):
        run.add_argument('--'+opt, required=True)
    run.add_argument('--timeout', type=int, default=300)
    triage = sub.add_parser('validate-triage')
    for opt in ('policy','observed','claims','output','sha'):
        triage.add_argument('--'+opt, required=True)
    scope = sub.add_parser('assert-scope')
    for opt in ('policy','repo','decision','output'):
        scope.add_argument('--'+opt, required=True)
    cmp = sub.add_parser('compare-tests')
    for opt in ('before','after','decision','output'):
        cmp.add_argument('--'+opt, required=True)
    args = p.parse_args()
    globals()[{'run-tests':'run_tests','validate-triage':'validate_triage',
               'assert-scope':'assert_scope','compare-tests':'compare_tests'}[args.action]](args)


if __name__ == '__main__':
    main()
