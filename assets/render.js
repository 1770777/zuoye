// 把一节课画成深色卡片（和桌面版截图同款排版）

const CARD_WIDTH = 600;
const PAD_X = 32;
const PAD_Y = 24;
const FONT_SIZE = 26;
const LINE_HEIGHT = FONT_SIZE * 1.6;
const BG = "#1e1e1e";
const FG = "#f2f2f2";
const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", "Apple Color Emoji", sans-serif';

function makeContext(width, height, scale) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.font = `${FONT_SIZE}px ${FONT_STACK}`;
  ctx.textBaseline = "middle";
  return { canvas, ctx };
}

function wrapLines(ctx, lines, maxWidth) {
  const out = [];
  for (const line of lines) {
    if (ctx.measureText(line).width <= maxWidth) {
      out.push(line);
      continue;
    }
    let current = "";
    for (const ch of line) {
      if (current && ctx.measureText(current + ch).width > maxWidth) {
        out.push(current);
        current = ch;
      } else {
        current += ch;
      }
    }
    if (current) out.push(current);
  }
  return out;
}

function cardLines(lesson) {
  return [`${lesson.dateShort} ${lesson.nameOrClass}`, ...lesson.actions];
}

/** 画出卡片 canvas（纯同步，方便在用户点击的同一个手势里直接分享） */
function drawCard(lesson, scale = 2) {
  const probe = makeContext(CARD_WIDTH, 10, scale);
  const wrapped = wrapLines(probe.ctx, cardLines(lesson), CARD_WIDTH - PAD_X * 2);
  const height = Math.round(PAD_Y * 2 + wrapped.length * LINE_HEIGHT);

  const { canvas, ctx } = makeContext(CARD_WIDTH, height, scale);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CARD_WIDTH, height);
  ctx.fillStyle = FG;
  ctx.font = `${FONT_SIZE}px ${FONT_STACK}`;
  wrapped.forEach((line, i) => {
    ctx.fillText(line, PAD_X, PAD_Y + i * LINE_HEIGHT + LINE_HEIGHT / 2);
  });
  return canvas;
}

/** 同步拿到 PNG 的 dataURL（iOS 分享面板要求同一个手势内调用） */
function renderCardDataUrl(lesson, scale = 2) {
  return drawCard(lesson, scale).toDataURL("image/png");
}

/** 生成 PNG 的 Uint8Array（批量打包用） */
async function renderCardPng(lesson, scale = 2) {
  const canvas = drawCard(lesson, scale);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob 失败"))), "image/png");
  });
  return new Uint8Array(await blob.arrayBuffer());
}

window.JLRender = { renderCardPng, renderCardDataUrl, cardLines, drawCard };
