"""Deterministic contract tests for generic repair routing and validation."""
import json
from pathlib import Path
import tempfile
import unittest

import repair_core


POLICY = {
    'schema_version': 1,
    'test_command': ['node', '--test', '--test-reporter=junit',
                     '--test-reporter-destination={junit_report}'],
    'test_report_glob': '{junit_report}',
    'test_file_globs': ['tests/*.test.js', 'tests/**/*.test.js'],
    'implementation_edit_globs': ['src/**'],
    'protected_globs': ['.github/**', 'docs/**', 'AGENTS.md'],
    'max_repair_attempts': 2,
    'max_test_files_per_repair': 5,
    'max_test_delta_lines': 500,
}


class RepairContractTests(unittest.TestCase):
    def setUp(self):
        self.root_context = tempfile.TemporaryDirectory()
        self.addCleanup(self.root_context.cleanup)
        self.root = Path(self.root_context.name)
        (self.root / 'policy.json').write_text(json.dumps(POLICY))

    def write(self, name, value):
        path = self.root / name
        path.write_text(json.dumps(value))
        return str(path)

    def test_dynamic_test_paths_not_specific_filenames(self):
        for path in ('tests/example.test.js', 'tests/other.test.js',
                     'tests/components/new.test.js'):
            self.assertTrue(repair_core.path_matches(path, POLICY['test_file_globs']))
        self.assertFalse(repair_core.path_matches('src/app.js', POLICY['test_file_globs']))
        self.assertFalse(repair_core.path_matches('../outside.test.js', POLICY['test_file_globs']))

    def test_mixed_failure_keeps_both_independent_classifications(self):
        observed = {'failures': [
            {'id': 'f1', 'name': 'fixture', 'test_paths': ['tests/f.test.js'], 'details': 'mock'},
            {'id': 'f2', 'name': 'logic', 'test_paths': ['tests/g.test.js'], 'details': 'expected'}]}
        claims = {'schema_version': 2, 'failures': [
            {'id': 'f1', 'classification': 'TEST_DEFECT', 'confidence': 'HIGH',
             'requirement': 'Spec ABC', 'evidence': 'Fixture lacks required function used by a compliant client',
             'repair_guidance': 'Fix mock function definition while preserving the assertions'},
            {'id': 'f2', 'classification': 'IMPLEMENTATION_DEFECT', 'confidence': 'HIGH',
             'requirement': 'Spec XYZ', 'evidence': 'Application returns the wrong value for a required valid case',
             'repair_guidance': 'Fix the application result without changing independent tests'}]}
        args = type('Args', (), {'observed': self.write('observed.json', observed),
                'claims': self.write('claims.json', claims),
                'policy': str(self.root/'policy.json'),
                'sha': 'abc'*13+'a', 'output': str(self.root/'decision.json')})()
        repair_core.validate_triage(args)
        result = json.loads((self.root/'decision.json').read_text())
        self.assertEqual(result['route'], 'TEST_REPAIR')
        self.assertEqual([f['classification'] for f in result['failures']],
                         ['TEST_DEFECT', 'IMPLEMENTATION_DEFECT'])

    def test_unlocatable_test_is_inconclusive_without_erasing_other_findings(self):
        observed = {'failures': [{'id':'f1', 'name':'x', 'test_paths':[], 'details':'fail'}]}
        claims = {'schema_version':2,'failures':[
            {'id':'f1','classification':'TEST_DEFECT','confidence':'HIGH',
             'requirement':'Approved UC','evidence':'A detailed explanation of a failing test setup',
             'repair_guidance':'Correct setup of the test in the source file'}]}
        args = type('Args', (), {'observed':self.write('o.json',observed),
                'claims':self.write('c.json',claims),
                'policy':str(self.root/'policy.json'),
                'sha':'abc', 'output':str(self.root/'d.json')})()
        repair_core.validate_triage(args)
        result=json.loads((self.root/'d.json').read_text())
        self.assertEqual(result['route'],'HUMAN_REVIEW')
        self.assertEqual(result['failures'][0]['classification'],'INCONCLUSIVE')

    def test_partial_repair_does_not_require_all_tests_green(self):
        before={'tests':[{'id':'a'},{'id':'b'},{'id':'c'}],
                'failures':[{'id':'a'},{'id':'b'}]}
        after={'tests':before['tests'],'failures':[{'id':'b'}]}
        decision={'failures':[{'id':'a','classification':'TEST_DEFECT'},
                              {'id':'b','classification':'IMPLEMENTATION_DEFECT'}]}
        args=type('Args',(),{'before':self.write('b.json',before),
             'after':self.write('a.json',after),
             'decision':self.write('d.json',decision),
             'output':str(self.root/'progress.json')})()
        repair_core.compare_tests(args)
        progress=json.loads((self.root/'progress.json').read_text())
        self.assertEqual(progress['resolved'],['a'])
        self.assertEqual(progress['remaining'],['b'])

    def test_changed_failure_cause_can_be_a_partial_repair(self):
        before={'tests':[{'id':'a'}], 'failures':[{'id':'a','details':'bad mock'}]}
        after={'tests':[{'id':'a'}], 'failures':[{'id':'a','details':'a different implementation assertion'}]}
        decision={'failures':[{'id':'a','classification':'TEST_DEFECT'}]}
        args=type('Args',(),{'before':self.write('b.json',before),
             'after':self.write('a.json',after),
             'decision':self.write('d.json',decision),
             'output':str(self.root/'progress.json')})()
        repair_core.compare_tests(args)
        progress=json.loads((self.root/'progress.json').read_text())
        self.assertEqual(progress['changed_cause'],['a'])
        self.assertEqual(progress['remaining'],['a'])

    def test_disappearing_test_is_not_a_successful_repair(self):
        before={'tests':[{'id':'a'},{'id':'b'}], 'failures':[{'id':'a'}]}
        after={'tests':[{'id':'b'}], 'failures':[]}
        decision={'failures':[{'id':'a','classification':'TEST_DEFECT'}]}
        args=type('Args',(),{'before':self.write('b.json',before),
             'after':self.write('a.json',after),
             'decision':self.write('d.json',decision),
             'output':str(self.root/'progress.json')})()
        with self.assertRaises(SystemExit):
            repair_core.compare_tests(args)


if __name__=='__main__':
    unittest.main()
