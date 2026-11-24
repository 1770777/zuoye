// 教案匹配引擎（从 generate_plans.py 移植，规则一一对应）

// 合并课默认在小器械/垫上教室，这些大器械动作会被跳过
const BIG_APPARATUS = [
  "凯迪拉克", "划船", "划床", "推床", "核心床", "梯桶", "稳踏椅", "大器械",
];

const AREA_SERIES = {
  "腹": "腰腹",
  "肩背": "肩背",
  "肩": "肩背",
  "背": "肩背",
  "臀腿": "臀腿",
  "臀": "臀腿",
  "腿": "臀腿",
};

const KNIFE_KEYWORDS = [
  "筋膜刀", "斜方肌", "小腿", "股四头肌", "阔筋膜张肌", "肩", "背", "腰", "腿",
];

/** 解析 补充数据.txt：标题行 + 动作行 */
function parseLibrary(text) {
  const lib = new Map();
  let title = null;
  let actions = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(私教-|团课-|波速球-|甜甜圈-|Tabata-)/.test(line)) {
      if (title && actions.length) lib.set(title, actions);
      title = line.replace(/[：:]+$/, "").trim();
      actions = [];
    } else if (title) {
      actions.push(line);
    }
  }
  if (title && actions.length) lib.set(title, actions);
  return lib;
}

/** 同一天不同学员不撞车 + 同一学员逐次进阶 */
class RotationManager {
  constructor(lib) {
    this.lib = lib;
    const defs = {
      "腰腹": ["私教-腰腹 1", "私教-腰腹 2", "私教-腹部 3"],
      "臀腿": ["私教-臀腿 1", "私教-臀腿 2", "私教-臀腿 3"],
      "肩背": ["私教-肩背 1", "私教-肩背 2"],
      "瑜伽-上肢": ["私教-瑜伽-上肢 1", "私教-瑜伽-上肢 2"],
      "瑜伽-下肢": ["私教-瑜伽-下肢 1", "私教-瑜伽-下肢 2"],
      "孕期": ["私教-孕期-普拉提", "私教-孕期-瑜伽"],
    };
    this.series = {};
    for (const [key, list] of Object.entries(defs)) {
      const valid = list.filter((v) => lib.has(v) && lib.get(v).length);
      if (valid.length) this.series[key] = valid;
    }
    this.counters = {};
    for (const key of Object.keys(this.series)) this.counters[key] = 0;
    this.memberHistory = new Map();
    this.dayUsed = new Map();
  }

  static pickFree(start, n, used) {
    for (let offset = 0; offset < n; offset++) {
      const idx = (start + offset) % n;
      if (!used.has(idx)) return idx;
    }
    return start % n;
  }

  getVariant(seriesKey, memberName, explicitNum = null, day = "") {
    const variants = this.series[seriesKey];
    if (!variants) return null;
    const n = variants.length;
    const key = `${memberName}||${seriesKey}`;
    const usedKey = `${day}||${seriesKey}`;
    if (!this.dayUsed.has(usedKey)) this.dayUsed.set(usedKey, new Set());
    const used = this.dayUsed.get(usedKey);

    let idx;
    if (explicitNum !== null) {
      idx = (Number(explicitNum) - 1) % n;
    } else if (this.memberHistory.has(key)) {
      const start = (this.memberHistory.get(key) + 1) % n;
      idx = RotationManager.pickFree(start, n, used);
    } else {
      const start = this.counters[seriesKey] % n;
      idx = RotationManager.pickFree(start, n, used);
      this.counters[seriesKey] += 1;
    }

    this.memberHistory.set(key, idx);
    used.add(idx);
    return [...this.lib.get(variants[idx])];
  }
}

function hasAny(text, words) {
  return words.some((w) => text.includes(w));
}

function matFriendly(items) {
  const kept = items.filter((x) => !hasAny(x, BIG_APPARATUS));
  return kept.length ? kept : [...items];
}

/** 把“腹部+肩”拆成 ["腹","肩"]；“肩背”“臀腿”算一个部位，最多取两个 */
function splitAreas(part) {
  const areas = [];
  if (part.includes("腹")) areas.push("腹");
  if (part.includes("肩背") || (part.includes("肩") && part.includes("背"))) areas.push("肩背");
  else if (part.includes("肩")) areas.push("肩");
  else if (part.includes("背")) areas.push("背");
  if (part.includes("臀腿") || (part.includes("臀") && part.includes("腿"))) areas.push("臀腿");
  else if (part.includes("臀")) areas.push("臀");
  else if (part.includes("腿")) areas.push("腿");
  return areas.slice(0, 2);
}

/** 优先带“系列/×”的成套动作，挑完仍按原顺序输出 */
function pickSeriesItems(core, n, avoid = [], avoidWord = null) {
  const order = core
    .map((text, index) => ({ text, index }))
    .sort((a, b) => {
      const ra = a.text.includes("系列") || a.text.includes("×") ? 0 : 1;
      const rb = b.text.includes("系列") || b.text.includes("×") ? 0 : 1;
      return ra - rb || a.index - b.index;
    });

  const pickedIdx = [];
  const pickedTexts = new Set();
  for (const { text, index } of order) {
    if (avoidWord && text.includes(avoidWord)) continue;
    if (avoid.includes(text) || pickedTexts.has(text)) continue;
    pickedIdx.push(index);
    pickedTexts.add(text);
    if (pickedIdx.length >= n) break;
  }
  return pickedIdx.sort((a, b) => a - b).map((i) => core[i]);
}

function fuseAreas(areas, duration, cleanName, rotation, day, lib) {
  for (const combo of [areas.join("+"), [...areas].reverse().join("+")]) {
    for (const prefix of ["私教-", "团课-"]) {
      const hit = lib.get(prefix + combo);
      if (hit && hit.length) return [...hit];
    }
  }

  const plans = [];
  for (const area of areas) {
    const series = AREA_SERIES[area];
    if (!series) return null;
    const picked = rotation.getVariant(series, cleanName, null, day);
    if (!picked) return null;
    plans.push(picked);
  }

  const n = duration === "90分钟" ? 3 : 2;
  const selected = [];

  const primary = matFriendly(plans[0].filter((x) => !x.includes("拉伸")));
  if (primary.length && primary[0].includes("松解")) selected.push(primary.shift());
  if (primary.length && primary[0].includes("灵活")) selected.push(primary.shift());
  selected.push(...pickSeriesItems(primary, n, selected));

  for (const extra of plans.slice(1)) {
    const core = matFriendly(
      extra.filter((x) => !x.includes("拉伸") && !x.includes("松解"))
    );
    selected.push(...pickSeriesItems(core, n, selected, "灵活"));
  }

  return [...selected, "拉伸"];
}

/** 单节课匹配 */
function queryActions(ctx, nameOrClass, cleanName, part, duration, rotation, day) {
  const { lib } = ctx;
  const text = `${nameOrClass} ${cleanName} ${part}`;
  const is30 = duration === "30分钟" || text.includes("30min") || text.includes("30分");

  if (is30) {
    if (text.includes("盘髋") && lib.get("私教-盘髋 30min")) {
      return [...lib.get("私教-盘髋 30min")];
    }
    if (!text.includes("瑜伽") && !text.includes("普拉提") && hasAny(text, KNIFE_KEYWORDS)) {
      if (part.includes("股四头肌") || part.includes("阔筋膜张肌")) return [part.trim()];
      if (hasAny(text, ["小腿", "胫骨"])) return knife("腿部");
      if (hasAny(text, ["腿", "大腿"])) return knife("腿部");
      if (hasAny(text, ["背", "上背", "下背"])) return knife("背部");
      if (hasAny(text, ["腰", "腰部"])) return knife("腰部");
      if (hasAny(text, ["肩", "斜方肌", "颈"])) return knife("肩");
      return ["菱形肌、斜方肌"];
    }
  }

  function knife(kind) {
    const defaults = {
      "腿部": ["胫骨前肌、腓肠肌、比目鱼肌、胫骨后肌"],
      "背部": ["背阔肌、竖脊肌、腰方肌"],
      "腰部": ["腰方肌、腹直肌、腹斜肌"],
      "肩": ["胸小肌、胸锁乳突肌、斜方肌"],
    };
    return [...(lib.get(`私教-筋膜刀-${kind}`) || defaults[kind] || [])];
  }

  // 团课 / 燃脂特色课
  for (const [title, acts] of lib) {
    if (!acts.length) continue;
    if (/^(团课-|波速球-|甜甜圈-|Tabata-)/.test(title)) {
      const pure = title.replace("团课-", "").trim();
      if (pure && (text.includes(pure) || text.includes(pure.replace("-燃脂", "")))) {
        return [...acts];
      }
    }
  }

  // 团课别名
  const aliases = [
    ["马甲线", "团课-马甲线打造"],
    ["蜜桃臀", "团课-蜜桃臀"],
    ["美臀", "团课-极致美臀"],
    ["甜甜圈", "甜甜圈-燃脂"],
    ["波速球", "波速球-燃脂"],
    ["一字肩", "团课-一字肩"],
    ["背肌提升", "团课-背肌提升"],
    ["核心激活", "团课-核心激活"],
    ["核心提升", "团课-核心提升"],
    ["腰腹塑形", "团课-腰腹塑形"],
    ["全身塑形", "团课-全身塑形"],
    ["综合训练", "团课-综合训练"],
    ["暴汗燃脂", "团课-暴汗燃脂"],
  ];
  for (const [word, key] of aliases) {
    if (text.includes(word) && lib.get(key)) return [...lib.get(key)];
  }
  if (text.toLowerCase().includes("tabata") && lib.get("Tabata-燃脂")) {
    return [...lib.get("Tabata-燃脂")];
  }
  if ((text.includes("美背") || text.includes("开肩美背")) && lib.get("团课-美肩美背")) {
    return [...lib.get("团课-美肩美背")];
  }
  if (hasAny(text, ["臀腿精雕", "臀腿塑型", "臀腿塑形", "提臀瘦腿"]) && lib.get("团课-臀腿塑型")) {
    return [...lib.get("团课-臀腿塑型")];
  }

  // 腹+背 专属
  if ((text.includes("腹") && text.includes("背")) || text.includes("腹+背")) {
    if (lib.get("私教-腹+背")) return [...lib.get("私教-腹+背")];
  }

  // 60 分钟筋膜刀
  if (text.includes("筋膜刀") || text.includes("斜方肌")) {
    if (hasAny(text, ["腿", "小腿", "大腿"])) return knife("腿部");
    if (hasAny(text, ["背", "上背", "下背"])) return knife("背部");
    if (hasAny(text, ["腰", "腰部"])) return knife("腰部");
    if (hasAny(text, ["肩", "斜方肌", "颈"])) return knife("肩");
    return ["菱形肌、斜方肌"];
  }

  // 腹+腿 复合
  if (part.includes("腹") && (part.includes("腿") || part.includes("臀"))) {
    const fu = lib.get("私教-腰腹 1") || ["脊柱灵活 骨盆灵活", "小桌板系列1、2、3", "船式系列"];
    const tui = lib.get("私教-臀腿 1") || ["外展内收×2", "反向屈髋×4", "拉伸"];
    const fuCore = matFriendly(fu.filter((x) => !x.includes("拉伸")));
    const tuiCore = matFriendly(tui.slice(1).filter((x) => !x.includes("拉伸")));
    const head = duration === "90分钟" ? fuCore.slice(0, 5) : fuCore.slice(0, 4);
    return [...head, ...tuiCore.slice(0, 3), "拉伸"];
  }

  // 其他两部位融合
  const areas = splitAreas(part);
  if (areas.length === 2) {
    const fused = fuseAreas(areas, duration, cleanName, rotation, day, lib);
    if (fused) return fused;
  }

  // 显式指定方案
  const explicitMatch = text.match(/(?:腰腹|腹部|臀腿|肩背|瑜伽|孕期|综合)\s*(?:第)?\s*([123])/);
  const explicitNum = explicitMatch ? explicitMatch[1] : null;

  // 瑜伽优先
  if (text.includes("瑜伽") && !text.includes("孕期")) {
    if (text.includes("盘髋") && lib.get("私教-盘髋")) return [...lib.get("私教-盘髋")];
    if (text.includes("全身") && lib.get("私教-瑜伽-全身")) return [...lib.get("私教-瑜伽-全身")];
    let res = null;
    if (hasAny(text, ["上肢", "肩", "背"])) {
      res = rotation.getVariant("瑜伽-上肢", cleanName, explicitNum, day);
    } else if (hasAny(text, ["下肢", "腿", "髋"])) {
      res = rotation.getVariant("瑜伽-下肢", cleanName, explicitNum, day);
    } else {
      res = rotation.getVariant("瑜伽-上肢", cleanName, explicitNum, day);
    }
    if (res) return res;
  }

  if (hasAny(text, ["腰腹", "腹部", "腹"])) {
    const res = rotation.getVariant("腰腹", cleanName, explicitNum, day);
    if (res) return res;
  }
  if (hasAny(text, ["臀腿", "臀", "下肢"])) {
    const res = rotation.getVariant("臀腿", cleanName, explicitNum, day);
    if (res) return res;
  }
  if (hasAny(text, ["肩背", "背", "上肢"])) {
    const res = rotation.getVariant("肩背", cleanName, explicitNum, day);
    if (res) return res;
  }
  if (text.includes("盘髋") && lib.get("私教-盘髋")) return [...lib.get("私教-盘髋")];

  if (text.includes("孕期")) {
    if (text.includes("瑜伽") && lib.get("私教-孕期-瑜伽")) return [...lib.get("私教-孕期-瑜伽")];
    if (text.includes("普拉提") && lib.get("私教-孕期-普拉提")) return [...lib.get("私教-孕期-普拉提")];
    const res = rotation.getVariant("孕期", cleanName, explicitNum, day);
    if (res) return res;
  }

  if (text.includes("综合") && lib.get("私教-综合 1")) return [...lib.get("私教-综合 1")];

  // 学员历史档案兜底（和桌面版同顺序：先“同部位”，再“只看姓名”）
  const history = ctx.history || [];
  for (const [header, acts] of history) {
    if (!header.includes(cleanName)) continue;
    if (part && (header.includes(part) || header.includes(part.replace("部", "")))) {
      return [...acts];
    }
  }
  for (const [header, acts] of history) {
    if (header.includes(cleanName)) return [...acts];
  }

  // 最后兜底
  ctx.unmatched.push(nameOrClass);
  return [...(lib.get("私教-腰腹 1") || [
    "脊柱灵活 骨盆灵活", "骶骨小球系列1、2", "小桌板系列1、2、3", "船式系列", "拉伸",
  ])];
}

/** 解析导入的历史档案 txt（9 月.txt / 10 月.txt 这一类的格式） */
function parseHistoryText(text, fileName) {
  const records = [];
  let header = null;
  let actions = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^\d{1,2}\.\d+/.test(line)) {
      if (header && actions.length) records.push([header, actions, fileName]);
      header = line;
      actions = [];
    } else if (header) {
      actions.push(line);
    }
  }
  if (header && actions.length) records.push([header, actions, fileName]);
  return records;
}

/** 解析一行待办 */
function parseLesson(ctx, rawLine, rotation, year) {
  const line = rawLine.trim();
  if (!line) return null;

  let duration = "60分钟";
  if (/30\s*min|30\s*分/i.test(line)) duration = "30分钟";
  else if (/90\s*min|90\s*分/i.test(line)) duration = "90分钟";

  let monthNum = null;
  let dateStr;
  let dateShort;
  let nameOrClass;
  const m = line.match(/^(\d{1,2})[./-](\d{1,2})\s*(.*)$/);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    monthNum = month;
    dateStr = `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
    dateShort = `${month}.${day}`;
    nameOrClass = m[3].trim();
  } else {
    dateStr = `${year}/11/01`;
    dateShort = "11.1";
    nameOrClass = line;
  }

  const cleanName = nameOrClass
    .replace(/30\s*min|30\s*分|90\s*min|90\s*分|60\s*min|60\s*分|[（(].*?[）)]/gi, "")
    .trim();
  const partMatch = nameOrClass.match(/[（(](.*?)[）)]/);
  const part = partMatch ? partMatch[1].trim() : "";

  const actions = queryActions(ctx, nameOrClass, cleanName, part, duration, rotation, dateShort);

  return { raw: line, monthNum, dateStr, dateShort, nameOrClass, cleanName, part, duration, actions };
}

/** 跑完整流程，返回生成的课时与文本 */
function generate(text, lib, history) {
  const ctx = { lib, history: history || [], unmatched: [] };
  const rotation = new RotationManager(lib);
  const year = new Date().getFullYear();

  const rawLines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const cancelled = rawLines.filter((l) => /❌|✖|取消/.test(l));
  const lines = rawLines.filter((l) => !cancelled.includes(l));

  const lessons = [];
  for (const line of lines) {
    const lesson = parseLesson(ctx, line, rotation, year);
    if (lesson) lessons.push(lesson);
  }

  const months = lessons.map((l) => l.monthNum).filter((m) => m !== null);
  const month = months.length ? months[0] : 11;

  const blocks = lessons.map(
    (l) => `${l.dateShort} ${l.nameOrClass}\n${l.actions.join("\n")}`
  );

  return {
    lessons,
    cancelled,
    unmatched: ctx.unmatched,
    month,
    monthFile: `${month} 月.txt`,
    text: blocks.length ? `${blocks.join("\n\n")}\n` : "",
  };
}

/** 图片文件名，与桌面版一致 */
function fileNameFor(lesson, index, total) {
  const digits = total >= 100 ? 3 : 2;
  const safe = `${lesson.dateShort} ${lesson.nameOrClass}`.replace(/[\\/*?:"<>|\s]/g, "_");
  return `${String(index + 1).padStart(digits, "0")}_${safe}_${lesson.duration}.png`;
}

// 暴露给页面（本项目用传统 script 引入，避免 file:// 下 ES module 被拦）
window.JL = {
  BIG_APPARATUS,
  parseLibrary,
  parseHistoryText,
  RotationManager,
  queryActions,
  parseLesson,
  generate,
  fileNameFor,
};
