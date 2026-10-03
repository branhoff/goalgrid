import pathlib
import sys
import tempfile
import unittest

sys.path.insert(
    0, str(pathlib.Path(__file__).resolve().parents[1] / "src" / "habit_hooks_c" / "sensors")
)
import c_structure  # noqa: E402


def smells_for(source, *flags):
    with tempfile.NamedTemporaryFile("w", suffix=".c", delete=False) as handle:
        handle.write(source)
    return {
        finding["smell"]: finding["issues"] for finding in c_structure.run([*flags, handle.name])
    }


class CStructureTest(unittest.TestCase):
    def test_clean_file_has_no_findings(self):
        self.assertEqual(smells_for("static int add(int a, int b) {\n  return a + b;\n}\n"), {})

    def test_too_many_parameters(self):
        found = smells_for("void f(int a, int b, int c) {\n}\n", "--max-params", "2")
        self.assertIn("too-many-parameters", found)

    def test_void_and_empty_parameter_lists_count_zero(self):
        self.assertEqual(smells_for("void f(void) {\n}\nvoid g() {\n}\n", "--max-params", "0"), {})

    def test_deep_nesting_counts_control_blocks_only(self):
        nested = "void f(int a) {\n  if (a) {\n    while (a) {\n      a--;\n    }\n  }\n}\n"
        self.assertIn("deep-nesting", smells_for(nested, "--max-nesting", "1"))
        self.assertEqual(smells_for(nested, "--max-nesting", "2"), {})
        initializer = "void f(void) {\n  int x[2] = {\n    1, 2,\n  };\n}\n"
        self.assertEqual(smells_for(initializer, "--max-nesting", "0"), {})

    def test_oversized_function(self):
        body = "void f(void) {\n" + "  g();\n" * 5 + "}\n"
        self.assertIn("oversized-function", smells_for(body, "--max-function-lines", "4"))
        self.assertEqual(smells_for(body, "--max-function-lines", "7"), {})

    def test_preprocessor_continuations_do_not_confuse_function_names(self):
        source = "#define M(a) \\\n  foo(a)\nvoid real_name(int a, int b) {\n}\n"
        found = smells_for(source, "--max-params", "1")
        self.assertTrue(found["too-many-parameters"][0]["key"].endswith(":real_name"))

    def test_narrating_comment_flagged_but_why_comment_is_not(self):
        narrating = "void f(int count) {\n  // increment count\n  count++;\n}\n"
        self.assertIn("non-essential-comment", smells_for(narrating))
        why = "void f(int count) {\n  // skip zero because the device reports it\n  count++;\n}\n"
        self.assertEqual(smells_for(why), {})

    def test_strings_and_comments_do_not_affect_braces(self):
        source = 'void f(void) {\n  puts("}{");\n  /* } */\n}\n'
        self.assertEqual(smells_for(source, "--max-function-lines", "10"), {})

    def test_multiple_files_are_grouped_by_smell(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = []
            for name in ("a.c", "b.c"):
                path = pathlib.Path(directory) / name
                path.write_text("void f(int a, int b) {\n}\n")
                paths.append(str(path))
            [finding] = c_structure.run(["--max-params", "1", *paths])
        self.assertEqual(len(finding["issues"]), 2)


if __name__ == "__main__":
    unittest.main()
