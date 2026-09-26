/**
 * apply-template.ts —— 把「业务规格模式」模板落到目标项目。
 *
 * 用法：
 *   node apply-template.ts --target "D:\path\to\项目" --domains "销售管理,采购管理,库存管理" [--with-sample] [--force] [--dry-run]
 *
 * 行为：
 *   1. 在目标项目建 业务规格/ 与各业务域目录（横向支撑域默认 4 个）
 *   2. 生成 AGENTS.md / BLUEPRINT.md / DECISIONS.md / WORKFLOW.md（已存在则跳过，--force 才覆盖）
 *   3. 生成 业务规格/README.md；--with-sample 时额外复制样例域 _样例-库存管理/
 *   4. 打印计划与结果；任何"跳过"都会明示，便于复核
 *
 * 约束：不碰目标项目任何既有业务文件；不删除、不改写已有文件（除 --force 覆盖四份文档）。
 */

import * as fs from "node:fs";
import * as path from "node:path";

type Options = {
  target: string;
  domains: string[];
  withSample: boolean;
  force: boolean;
  dryRun: boolean;
};

const HORIZONTAL_DOMAINS = ["通用", "基础数据", "技术架构", "权限管理"];

const DOC_TEMPLATES = [
  ["AGENTS.md.template", "AGENTS.md"],
  ["BLUEPRINT.md.template", "BLUEPRINT.md"],
  ["DECISIONS.md.template", "DECISIONS.md"],
  ["WORKFLOW.md.template", "WORKFLOW.md"],
];

function parseArgs(argv: string[]): Options {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (name: string): boolean => argv.includes(`--${name}`);

  const target = get("target");
  if (!target) {
    console.error("缺少 --target。用法见文件头注释。");
    process.exit(2);
  }
  const domains = (get("domains") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return {
    target: path.resolve(target),
    domains,
    withSample: has("with-sample"),
    force: has("force"),
    dryRun: has("dry-run"),
  };
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const scriptDir = import.meta.dirname;
  const templateRoot = path.resolve(scriptDir, "..");
  const created: string[] = [];
  const skipped: string[] = [];
  const copied: string[] = [];

  if (!fs.existsSync(opts.target) || !fs.statSync(opts.target).isDirectory()) {
    console.error(`目标目录不存在或不是目录：${opts.target}`);
    process.exit(2);
  }

  const specRoot = path.join(opts.target, "业务规格");
  const allDomains = [...HORIZONTAL_DOMAINS, ...opts.domains];
  const sampleDest = path.join(specRoot, "_样例-库存管理");
  // 样例域是否"本来就在"必须在建目录之前判定：否则建目录循环会先把它建出来，复制阶段误判为已存在而跳过
  const samplePreExisting = fs.existsSync(sampleDest);

  // 1) 目录
  const dirs = [specRoot, ...allDomains.map((d) => path.join(specRoot, d))];
  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      skipped.push(`目录已存在：${dir}`);
      continue;
    }
    if (!opts.dryRun) fs.mkdirSync(dir, { recursive: true });
    created.push(`目录：${dir}`);
  }

  // 1b) 每个业务域播种 00-域索引.md（用域索引模板，替换域名为真实域名）
  const indexTemplatePath = path.join(templateRoot, "业务规格", "_模板-域索引.md.template");
  if (fs.existsSync(indexTemplatePath)) {
    const indexTemplate = fs.readFileSync(indexTemplatePath, "utf8");
    for (const domain of allDomains) {
      const dest = path.join(specRoot, domain, "00-域索引.md");
      if (fs.existsSync(dest) && !opts.force) {
        skipped.push(`已存在，未覆盖：${dest}`);
        continue;
      }
      const body = indexTemplate.split("{{域}}").join(domain);
      if (!opts.dryRun) fs.writeFileSync(dest, body, "utf8");
      created.push(`域索引：${dest}`);
    }
  } else {
    skipped.push("模板缺少 业务规格/_模板-域索引.md.template，域索引未播种");
  }

  // 2) 四份核心文档
  for (const [from, to] of DOC_TEMPLATES) {
    const src = path.join(templateRoot, from);
    const dest = path.join(opts.target, to);
    if (!fs.existsSync(src)) {
      skipped.push(`模板缺件，未生成 ${to}（缺 ${from}）`);
      continue;
    }
    if (fs.existsSync(dest) && !opts.force) {
      skipped.push(`已存在，未覆盖：${dest}（需要覆盖加 --force）`);
      continue;
    }
    if (!opts.dryRun) fs.copyFileSync(src, dest);
    copied.push(`${to}  ←  ${from}`);
  }

  // 3) 业务规格目录说明
  const specReadmeSrc = path.join(templateRoot, "业务规格", "README.md");
  const specReadmeDest = path.join(specRoot, "README.md");
  if (fs.existsSync(specReadmeSrc)) {
    if (fs.existsSync(specReadmeDest) && !opts.force) {
      skipped.push(`已存在，未覆盖：${specReadmeDest}`);
    } else {
      if (!opts.dryRun) fs.copyFileSync(specReadmeSrc, specReadmeDest);
      copied.push("业务规格/README.md");
    }
  }

  // 4) 样例域
  if (opts.withSample) {
    const sampleSrc = path.join(templateRoot, "业务规格", "_样例-库存管理");
    if (!fs.existsSync(sampleSrc)) {
      skipped.push("模板里没有样例域目录，--with-sample 未生效");
    } else if (samplePreExisting && !opts.force) {
      skipped.push(`样例域已存在，未覆盖：${sampleDest}（需要覆盖加 --force）`);
    } else {
      if (!opts.dryRun) fs.cpSync(sampleSrc, sampleDest, { recursive: true, force: true });
      copied.push("业务规格/_样例-库存管理/（样例域 2 个文件）");
    }
  }

  // 5) 报告
  const mode = opts.dryRun ? "预演（--dry-run，未写盘）" : "已执行";
  console.log(`\n=== apply-template ${mode} ===`);
  console.log(`目标项目：${opts.target}`);
  console.log(`横向支撑域：${HORIZONTAL_DOMAINS.join(" / ")}`);
  console.log(`纵向业务域：${opts.domains.length > 0 ? opts.domains.join(" / ") : "（未指定，仅建横向域）"}`);
  console.log(`\n新建 ${created.length} 项：`);
  for (const c of created) console.log(`  + ${c}`);
  console.log(`生成文件 ${copied.length} 项：`);
  for (const c of copied) console.log(`  * ${c}`);
  if (skipped.length > 0) {
    console.log(`跳过 ${skipped.length} 项：`);
    for (const s of skipped) console.log(`  - ${s}`);
  }
  console.log("\n下一步：");
  console.log("  1. 填 AGENTS.md 的技术栈、关键命令、模块成熟度表（替换所有 {{占位}}）");
  console.log("  2. 按真实需求写各域 00-域索引.md 与业务规格（不要从代码反推）");
  console.log(`  3. 体检：node "${path.join(scriptDir, "check-spec-docs.ts")}" --target "${opts.target}"`);
  console.log("");
}

main();
