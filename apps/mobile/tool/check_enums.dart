// Fails when lib/shared/enums.dart and packages/shared-types/src/index.ts disagree.
//
//   dart run tool/check_enums.dart        (from apps/mobile)
//
// Both files are parsed with regular expressions on purpose: no build step, no
// dependencies, runs in a second in CI.
import 'dart:io';

Map<String, Set<String>> parseTs(String src) {
  final out = <String, Set<String>>{};
  for (final m in RegExp(r'export enum (\w+) \{([^}]*)\}').allMatches(src)) {
    out[m.group(1)!] = RegExp(r"'([A-Z0-9_]+)'").allMatches(m.group(2)!).map((v) => v.group(1)!).toSet();
  }
  return out;
}

Map<String, Set<String>> parseDart(String src) {
  final out = <String, Set<String>>{};
  for (final m in RegExp(r'enum (\w+) \{([\s\S]*?)\n\}').allMatches(src)) {
    out[m.group(1)!] = RegExp(r"@JsonValue\('([A-Z0-9_]+)'\)").allMatches(m.group(2)!).map((v) => v.group(1)!).toSet();
  }
  return out;
}

void main() {
  final root = File.fromUri(Platform.script).parent.parent;
  final tsFile = File('${root.path}/../../packages/shared-types/src/index.ts');
  final dartFile = File('${root.path}/lib/shared/enums.dart');
  final ts = parseTs(tsFile.readAsStringSync());
  final dart = parseDart(dartFile.readAsStringSync());

  var problems = 0;
  void report(String line) {
    problems++;
    stderr.writeln('  $line');
  }

  for (final name in {...ts.keys, ...dart.keys}) {
    final a = ts[name];
    final b = dart[name];
    if (a == null) {
      report('$name exists only in enums.dart');
      continue;
    }
    if (b == null) {
      report('$name is missing from enums.dart');
      continue;
    }
    for (final v in a.difference(b)) {
      report('$name.$v is in shared-types but not in enums.dart');
    }
    for (final v in b.difference(a)) {
      report('$name.$v is in enums.dart but not in shared-types');
    }
  }

  if (problems > 0) {
    stderr.writeln(
      '\nenums.dart and shared-types differ ($problems problem${problems == 1 ? '' : 's'}). Update lib/shared/enums.dart.',
    );
    exit(1);
  }
  stdout.writeln('enums.dart matches shared-types (${ts.length} enums).');
}
