/* 教案生成器 · 页面逻辑（传统 script，双击 HTML 也能直接用） */

(function () {
  const { parseLibrary, parseHistoryText, generate, fileNameFor } = window.JL;
  const { renderCardPng, renderCardDataUrl } = window.JLRender;
  const { createZip, downloadBlob } = window.JLZip;

  const $ = (id) => document.getElementById(id);
  const todoEl = $("todo");
  const runBtn = $("run");
  const zipBtn = $("zip");
  const txtBtn = $("txt");
  const statusEl = $("status");
  const resultEl = $("result");
  const summaryEl = $("summary");
  const cardsEl = $("cards");
  const progressEl = $("progress");

  let library = null;
  let librarySource = "";
  let current = null;
  let shareState = null; // { next, total }：分批存相册的进度
  let importedHistory = [];
  const builtinHistory = window.JL_HISTORY || [];
  const HISTORY_KEY = "jiaolan.history";

  const SAMPLE = [
    "11.1 张歆（腹）",
    "11.1 陈汐（背）",
    "11.1 开肩美背🌟🌟",
    "11.2 周子慧（孕期）",
    "11.2 林小满（腹部+肩）",
    "11.4 星野 90min（腹+腿）",
    "11.6 林佳 30min（股四头肌、阔筋膜张肌）",
    "11.7 波速球燃脂🌟🌟",
  ].join("\n");

  // 用系统分享面板「存储图像」直接进相册；不支持的浏览器退回下载
  const canShareFile = (() => {
    try {
      const probe = new File([new Blob(["x"], { type: "image/png" })], "x.png", {
        type: "image/png",
      });
      return !!(navigator.canShare && navigator.canShare({ files: [probe] }));
    } catch (_) {
      return false;
    }
  })();
  // 只要浏览器支持分享文件就用（Mac 上的 Chrome 也支持，不必限定触屏）
  const useShare = canShareFile;
  const saveLabel = useShare ? "存相册" : "存图";

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = `status ${kind || ""}`;
  }

  let hadSaved = false;

  function loadSaved() {
    let saved = null;
    try {
      saved = localStorage.getItem("jiaolan.todo");
    } catch (_) {
      saved = null;
    }
    hadSaved = saved !== null;
    todoEl.value = hadSaved ? saved : SAMPLE;
  }

  function save() {
    try {
      localStorage.setItem("jiaolan.todo", todoEl.value);
    } catch (_) {
      /* 隐私模式忽略 */
    }
  }

  function history() {
    return [...importedHistory, ...builtinHistory];
  }

  function updateHistoryInfo() {
    const info = $("histInfo");
    const total = history().length;
    if (!total) {
      info.textContent = "历史档案：未载入（没匹配到的课会走默认动作）";
      return;
    }
    const parts = [`历史档案：${total} 条`];
    if (importedHistory.length) parts.push(`其中导入 ${importedHistory.length} 条`);
    parts.push("没匹配到的课会按历史记录兜底");
    info.textContent = parts.join(" · ");
  }

  function loadImportedHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return;
      const files = JSON.parse(raw);
      importedHistory = files.flatMap((f) => parseHistoryText(f.text, f.name));
    } catch (_) {
      importedHistory = [];
    }
  }

  async function importHistory(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const saved = [];
    for (const file of files) {
      const text = await file.text();
      if (!text.trim()) continue;
      saved.push({ name: file.name, text });
    }
    if (!saved.length) return;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(saved));
    } catch (_) {
      setStatus("历史档案太大，存不下，本次仍然生效", "");
    }
    loadImportedHistory();
    updateHistoryInfo();
    if (todoEl.value.trim()) run();
    setStatus(`已导入 ${saved.length} 个历史档案，共 ${importedHistory.length} 条记录`, "ok");
  }

  function parse(text, source) {
    const lib = parseLibrary(text);
    if (!lib.size) throw new Error(`${source} 里没有解析到任何方案，请检查格式`);
    return lib;
  }

  async function loadLibrary() {
    // 线上优先读 补充数据.txt（改了就能生效）；本地双击打开时 fetch 会被拦，退回内置副本
    if (location.protocol !== "file:") {
      try {
        const res = await fetch("补充数据.txt", { cache: "no-cache" });
        if (res.ok) {
          const lib = parse(await res.text(), "补充数据.txt");
          librarySource = "补充数据.txt";
          return lib;
        }
      } catch (_) {
        /* 落到内置副本 */
      }
    }
    if (window.JL_LIBRARY) {
      const lib = parse(window.JL_LIBRARY, "内置动作库");
      librarySource = "内置副本";
      return lib;
    }
    throw new Error("既读不到 补充数据.txt，也没有内置动作库");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function dataUrlToBytes(url) {
    const base64 = url.slice(url.indexOf(",") + 1);
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function renderResults(data) {
    resultEl.hidden = false;
    const parts = [`共 ${data.lessons.length} 节`];
    if (data.cancelled.length) parts.push(`跳过 ${data.cancelled.length} 条已取消`);
    if (data.unmatched.length) parts.push(`${data.unmatched.length} 节未匹配`);

    summaryEl.innerHTML = "";
    const head = document.createElement("div");
    head.className = "summary-head";
    head.textContent = parts.join(" · ");
    summaryEl.appendChild(head);

    if (data.unmatched.length) {
      const warn = document.createElement("div");
      warn.className = "warn";
      warn.innerHTML =
        "<strong>没找到对应方案，已临时用【私教-腰腹 1】兜底：</strong>" +
        data.unmatched.map((n) => `<span class="chip">${escapeHtml(n)}</span>`).join("") +
        '<p class="hint">在 <code>补充数据.txt</code> 里补一套同名教案（如「团课-骨盆正位」），刷新后即可自动命中。</p>';
      summaryEl.appendChild(warn);
    }

    if (data.cancelled.length) {
      const skipped = document.createElement("div");
      skipped.className = "muted";
      skipped.textContent = `已跳过：${data.cancelled.join("、")}`;
      summaryEl.appendChild(skipped);
    }

    cardsEl.innerHTML = "";
    const frag = document.createDocumentFragment();
    const total = data.lessons.length;

    data.lessons.forEach((lesson, index) => {
      const card = document.createElement("article");
      card.className = "card";

      const bar = document.createElement("div");
      bar.className = "card-bar";
      const label = document.createElement("span");
      label.className = "card-date";
      label.textContent = `${lesson.dateShort} · ${lesson.duration}`;
      label.title = lesson.dateStr;

      const btn = document.createElement("button");
      btn.className = "mini";
      btn.type = "button";
      btn.textContent = saveLabel;
      btn.title = useShare ? "调用系统分享面板 → 存储图像" : "下载这一张 PNG";
      btn.addEventListener("click", () => saveOne(lesson, index, total, btn));

      bar.append(label, btn);

      const pre = document.createElement("pre");
      pre.textContent = [`${lesson.dateShort} ${lesson.nameOrClass}`, ...lesson.actions].join("\n");

      card.append(bar, pre);
      frag.appendChild(card);
    });
    cardsEl.appendChild(frag);
  }

  // 全部存相册：iOS/安卓只能通过系统分享面板「存储图像」进相册，
  // 且每次分享必须由一次点击触发，所以按 10 张一批，存完点「继续」。
  function resetShare() {
    shareState = null;
    $("shareAllText").textContent = "全部存到相册";
  }

  async function shareAll() {
    if (!current) return;
    if (!useShare) {
      setStatus("这台浏览器不支持系统分享面板，已改为打包下载；手机上用 Safari 打开可以一键进相册", "");
      downloadZip();
      return;
    }
    const total = current.lessons.length;
    if (!shareState || shareState.total !== total) shareState = { next: 0, total };

    const start = shareState.next;
    const end = Math.min(start + 10, total);
    const files = [];
    for (let i = start; i < end; i += 1) {
      const url = renderCardDataUrl(current.lessons[i]);
      files.push(
        new File([dataUrlToBytes(url)], fileNameFor(current.lessons[i], i, total), {
          type: "image/png",
        })
      );
    }

    const btn = $("shareAll");
    btn.disabled = true;
    try {
      await navigator.share({ files, title: `教案图片 ${start + 1}-${end}` });
    } catch (err) {
      btn.disabled = false;
      if (err && err.name === "AbortError") {
        setStatus("已取消，进度保留，点一下可以继续", "");
      } else {
        setStatus(`分享失败：${err.message}，可以改用「下载图片包」`, "err");
      }
      return;
    }
    btn.disabled = false;
    shareState.next = end;

    if (shareState.next >= total) {
      resetShare();
      setStatus(`已送出全部 ${total} 张，在分享面板选过「存储图像」就会进相册`, "ok");
    } else {
      $("shareAllText").textContent = `继续存（${shareState.next}/${total}）`;
      setStatus(`这批 ${end - start} 张已送出，选「存储图像」后回来点「继续存」`, "ok");
    }
  }

  // 单张保存：手机上走分享面板（能直接存进相册），电脑上直接下载
  function saveOne(lesson, index, total, btn) {
    const name = fileNameFor(lesson, index, total);
    const old = btn.textContent;

    if (useShare) {
      // 必须在点击的同一个手势里准备好文件，所以这里用同步 dataURL
      try {
        const dataUrl = renderCardDataUrl(lesson);
        const file = new File([dataUrlToBytes(dataUrl)], name, { type: "image/png" });
        navigator.share({ files: [file] }).catch((err) => {
          if (err && err.name === "AbortError") return;
          downloadBlob(new Blob([dataUrlToBytes(dataUrl)], { type: "image/png" }), name);
        });
        return;
      } catch (_) {
        /* 落到下载 */
      }
    }

    btn.disabled = true;
    btn.textContent = "生成中";
    renderCardPng(lesson)
      .then((png) => downloadBlob(new Blob([png], { type: "image/png" }), name))
      .catch((err) => setStatus(`保存失败：${err.message}`, "err"))
      .finally(() => {
        btn.disabled = false;
        btn.textContent = old;
      });
  }

  function run() {
    if (!library) {
      setStatus("动作库还没加载好，请刷新页面；若仍不行，把 补充数据.txt 和页面放在同一目录", "err");
      return;
    }
    const text = todoEl.value;
    if (!text.trim()) {
      setStatus("请先把排课清单粘贴到上面", "err");
      return;
    }
    save();
    try {
      current = generate(text, library, history());
    } catch (err) {
      console.error(err);
      setStatus(`生成失败：${err.message}`, "err");
      return;
    }
    if (!current.lessons.length) {
      setStatus("没有解析出任何一节课，请检查格式（例：11.1 张三（臀腿））", "err");
      resultEl.hidden = true;
      return;
    }
    renderResults(current);
    setStatus(`已生成 ${current.lessons.length} 节课，可以预览或下载了`, "ok");
    zipBtn.disabled = false;
    txtBtn.disabled = false;
    resetShare();
    $("shareAll").disabled = false;
    resultEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const tick = () => new Promise((r) => requestAnimationFrame(() => r()));

  async function downloadZip() {
    if (!current) return;
    const total = current.lessons.length;
    zipBtn.disabled = true;
    progressEl.hidden = false;
    try {
      const files = [];
      for (let i = 0; i < total; i += 1) {
        progressEl.textContent = `正在生成图片 ${i + 1}/${total}…`;
        if (i % 5 === 0) await tick();
        files.push({ name: fileNameFor(current.lessons[i], i, total), data: await renderCardPng(current.lessons[i]) });
      }
      progressEl.textContent = "正在打包…";
      await tick();
      files.push({ name: current.monthFile, data: new TextEncoder().encode(current.text) });
      downloadBlob(createZip(files), `教案_${current.month}月_${total}节.zip`);
      progressEl.textContent = `已打包 ${total} 张图片 + ${current.monthFile}`;
      setTimeout(() => {
        progressEl.hidden = true;
      }, 2500);
    } catch (err) {
      console.error(err);
      progressEl.textContent = `打包失败：${err.message}`;
    } finally {
      zipBtn.disabled = false;
    }
  }

  function downloadTxt() {
    if (!current) return;
    downloadBlob(new Blob([current.text], { type: "text/plain;charset=utf-8" }), current.monthFile);
  }

  runBtn.addEventListener("click", run);
  $("shareAll").addEventListener("click", shareAll);
  zipBtn.addEventListener("click", downloadZip);
  txtBtn.addEventListener("click", downloadTxt);
  todoEl.addEventListener("input", save);
  $("sample").addEventListener("click", () => {
    todoEl.value = SAMPLE;
    save();
    run();
  });
  $("clear").addEventListener("click", () => {
    todoEl.value = "";
    save();
    resultEl.hidden = true;
    zipBtn.disabled = true;
    txtBtn.disabled = true;
    $("shareAll").disabled = true;
    setStatus("");
  });

  $("shareAll").disabled = true;

  loadSaved();
  loadImportedHistory();
  updateHistoryInfo();

  $("histFile").addEventListener("change", (e) => {
    importHistory(e.target.files).finally(() => {
      e.target.value = "";
    });
  });
  $("histClear").addEventListener("click", () => {
    localStorage.removeItem(HISTORY_KEY);
    importedHistory = [];
    updateHistoryInfo();
    if (todoEl.value.trim()) run();
  });

  // 按钮一直可点：即使动作库没加载好，点击也会给出明确提示
  loadLibrary()
    .then((lib) => {
      library = lib;
      setStatus(`动作库已加载（${lib.size} 套 · 来自${librarySource}），点击「生成」即可`, "ok");
      if (!hadSaved) run();
    })
    .catch((err) => {
      setStatus(`${err.message}。请确认 补充数据.txt 与页面在同一目录。`, "err");
    });
})();
