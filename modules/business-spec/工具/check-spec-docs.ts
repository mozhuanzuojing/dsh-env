/**
 * check-spec-docs.ts —— 「业务规格模式」结构体检。
 *
 * 用法：
 *   node check-spec-docs.ts --target "D:\path\to\项目"
 *
 * 检查项：
 *   1. 四份核心文档在场（AGENTS.md / BLUEPRINT.md / DECISIONS.md / WORKFLOW.md）
 *   2. AGENTS.md 含五段关键约定（AI 工作原则、文档优先级、冲突处理纪律、模块成熟度表、严禁行为）
 *   3. 业务规格/ 在场，且每个业务域都有 00-域索引.md
 *   4. AGENTS.md 成熟度表里引用的规格文件真实存在
 *   5. WORKFLOW.md 含模块联动表
 *   6. 四份文档模板占位符 {{...}} 是否已替换干净
 *   7. 域内规格文件命名符合约定（*-业务规格.md），且已登记在各自 00-域索引.md 的文件清单
 *
 * 约定出处：业务规格/README.md 第二节。第 7 项只报 WARN —— 目标项目若已有既定命名，
 * 在域索引里声明后即可忽略，不阻塞。
 *
 * 退出码：0 = 全通过（可有 WARN）；1 = 有 FAIL；2 = 参数错误。
 */

import * as fs from "node:fs";
import * as path from "node:path";

type Options = { target: string };
type Result = { level: "PASS" | "WARN" | "FAIL"; msg: string };

const DOCS = ["AGENTS.md", "BLUEPRINT.md", "DECISIONS.md", "WORKFLOW.md"];

const AGENTS_REQUIRED_SECTIONS = [
  "AI 工作原则",
  "文档优先级",
  "冲突处理纪律",
  "模块成熟度表",
  "严禁行为",
];

const SAMPLE_PREFIX = "_样例";

function parseArgs(argv: string[]): Options {
  const i = argv.indexOf("--target");
  const target = i >= 0 ? argv[i + 1] : undefined;
  if (!target) {
    console.error("缺少 --target。用法：node check-spec-docs.ts --target <项目目录>");
    process.exit(2);
  }
  return { target: path.resolve(target) };
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const results: Result[] = [];
  const add = (level: Result["level"], msg: string): void => {
    results.push({ level, msg });
  };

  if (!fs.existsSync(opts.target) || !fs.statSync(opts.target).isDirectory()) {
    console.error(`目标目录不存在：${opts.target}`);
    process.exit(2);
  }

  // 1) 四份核心文档
  for (const doc of DOCS) {
    const p = path.join(opts.target, doc);
    if (fs.existsSync(p)) {
      const size = fs.statSync(p).size;
      if (size < 200) add("WARN", `${doc} 存在但只有 ${size} 字节，疑似空壳`);
      else add("PASS", `${doc} 在场（${size} 字节）`);
    } else {
      add("FAIL", `缺少 ${doc}`);
    }
  }

  // 2) AGENTS.md 关键约定
  const agentsPath = path.join(opts.target, "AGENTS.md");
  const agentsText = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, "utf8") : "";
  if (agentsText.length > 0) {
    const missing = AGENTS_REQUIRED_SECTIONS.filter((s) => !agentsText.includes(s));
    if (missing.length === 0) add("PASS", "AGENTS.md 五段关键约定齐备");
    else add("FAIL", `AGENTS.md 缺关键段落：${missing.join(" / ")}`);

    // 4) 成熟度表引用的规格文件
    const refs = new Set<string>();
    const re = /`(业务规格\/[^`]+\.md)`/g;
    let m: RegExpExecArray | null = re.exec(agentsText);
    while (m !== null) {
      refs.add(m[1]);
      m = re.exec(agentsText);
    }
    // 含 {{占位符}} 或通配符（如 业务规格/**/*.md）的引用不是具体文件，不计入"文件不存在"
    const isPattern = (r: string): boolean => r.includes("{{") || r.includes("*");
    const patternRefs = [...refs].filter(isPattern);
    const realRefs = [...refs].filter((r) => !isPattern(r));
    if (refs.size === 0) {
      add("WARN", "AGENTS.md 成熟度表未引用任何业务规格文件（模块尚未登记？）");
    } else if (realRefs.length === 0) {
      add("WARN", `成熟度表仅剩 ${patternRefs.length} 处占位/通配引用，尚无真实模块登记`);
    } else {
      const missingRefs = realRefs.filter((r) => !fs.existsSync(path.join(opts.target, r)));
      const tail = patternRefs.length > 0 ? `（另有 ${patternRefs.length} 处占位/通配引用待填）` : "";
      if (missingRefs.length === 0) add("PASS", `成熟度表引用的 ${realRefs.length} 个规格文件全部存在${tail}`);
      else add("FAIL", `成熟度表引用了不存在的规格文件：${missingRefs.join(" / ")}`);
    }
  }

  // 3) 业务规格目录与域索引
  const specRoot = path.join(opts.target, "业务规格");
  if (!fs.existsSync(specRoot)) {
    add("FAIL", "缺少 业务规格/ 目录（业务规则就没有权威来源）");
  } else {
    const dirs = fs
      .readdirSync(specRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const realDomains = dirs.filter((d) => !d.startsWith(SAMPLE_PREFIX));
    if (realDomains.length === 0) {
      add("WARN", "业务规格/ 下没有任何业务域目录（只剩样例域）");
    } else {
      add("PASS", `业务规格/ 下有 ${realDomains.length} 个业务域：${realDomains.join(" / ")}`);
    }
    const noIndex = realDomains.filter(
      (d) => !fs.existsSync(path.join(specRoot, d, "00-域索引.md")),
    );
    if (noIndex.length === 0 && realDomains.length > 0) add("PASS", "每个业务域都有 00-域索引.md");
    else if (noIndex.length > 0) add("FAIL", `以下业务域缺 00-域索引.md：${noIndex.join(" / ")}`);

    if (!fs.existsSync(path.join(specRoot, "README.md"))) {
      add("WARN", "业务规格/README.md 不在场（域划分与命名约定无处可查）");
    }

    // 3b) 域内命名约定与索引登记（约定出处：业务规格/README.md 第二节）
    const SPEC_SUFFIX = "-业务规格.md";
    const SKIP_NAMES = ["00-域索引.md", "README.md"];
    const badNames: string[] = [];
    const unlisted: string[] = [];
    let specCount = 0;
    for (const d of realDomains) {
      const domainDir = path.join(specRoot, d);
      const files = fs
        .readdirSync(domainDir, { withFileTypes: true })
        .filter((f) => f.isFile() && f.name.endsWith(".md") && !SKIP_NAMES.includes(f.name))
        .map((f) => f.name);
      if (files.length === 0) continue;
      specCount += files.length;
      const indexPath = path.join(domainDir, "00-域索引.md");
      const indexText = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : "";
      for (const f of files) {
        if (!f.endsWith(SPEC_SUFFIX)) badNames.push(`${d}/${f}`);
        if (indexText.length > 0 && !indexText.includes(f)) unlisted.push(`${d}/${f}`);
      }
    }
    if (specCount > 0) {
      if (badNames.length === 0) add("PASS", `${specCount} 份规格文件命名均符合约定（*${SPEC_SUFFIX}）`);
      else
        add(
          "WARN",
          `以下规格文件不符合命名约定 *${SPEC_SUFFIX}：${badNames.join(" / ")}（约定见 业务规格/README.md 第二节；若沿用既有命名，在域索引里声明后忽略）`,
        );
      if (unlisted.length === 0) add("PASS", "域内规格文件均已登记在各自 00-域索引.md 的文件清单");
      else add("WARN", `以下规格文件未登记在所属域的 00-域索引.md 文件清单：${unlisted.join(" / ")}`);
    }
  }

  // 5) WORKFLOW 模块联动表
  const wfPath = path.join(opts.target, "WORKFLOW.md");
  if (fs.existsSync(wfPath)) {
    const wf = fs.readFileSync(wfPath, "utf8");
    if (wf.includes("模块联动")) add("PASS", "WORKFLOW.md 含模块联动表");
    else add("WARN", "WORKFLOW.md 未见「模块联动」章节");
  }

  // 6) 占位符清理
  if (agentsText.includes("{{")) {
    const n = (agentsText.match(/\{\{[^}]*\}\}/g) ?? []).length;
    add("WARN", `AGENTS.md 仍有 ${n} 处 {{占位符}} 未替换`);
  } else if (agentsText.length > 0) {
    add("PASS", "AGENTS.md 占位符已清理");
  }

  // 报告
  const icon = (l: Result["level"]): string => (l === "PASS" ? "✅" : l === "WARN" ? "⚠️ " : "❌");
  console.log(`\n=== check-spec-docs ===`);
  console.log(`目标项目：${opts.target}\n`);
  results.forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. ${icon(r.level)} [${r.level}] ${r.msg}`));
  const pass = results.filter((r) => r.level === "PASS").length;
  const warn = results.filter((r) => r.level === "WARN").length;
  const fail = results.filter((r) => r.level === "FAIL").length;
  console.log(`\n结果：${pass} 通过 / ${warn} 警告 / ${fail} 失败`);
  if (fail > 0) {
    console.log("结论：未通过 —— 先补齐 FAIL 项；WARN 项逐条判断是否接受。\n");
    process.exit(1);
  }
  console.log("结论：结构自洽（WARN 项请逐条确认）。\n");
  process.exit(0);
}

main();
