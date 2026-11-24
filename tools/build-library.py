#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 补充数据.txt 和 9/10 月历史档案内联成 JS，供网页版使用。

用法：在 web/ 目录下运行
    python3 tools/build-library.py

生成两个文件：
  assets/library.js  动作库（双击打开 HTML 时用来替代 fetch）
  assets/history.js  历史档案（网页版用它给「没匹配到方案」的课兜底）
"""

import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
ROOT = os.path.dirname(WEB)


def build_library():
    src = os.path.join(WEB, "补充数据.txt")
    with open(src, encoding="utf-8") as f:
        text = f.read()

    out = (
        "// 由 补充数据.txt 自动生成：双击打开（file://）时浏览器不允许 fetch，用这份内置副本\n"
        "// 改了 补充数据.txt 后重新运行 python3 tools/build-library.py\n"
        "window.JL_LIBRARY = " + json.dumps(text, ensure_ascii=False) + ";\n"
    )
    with open(os.path.join(WEB, "assets", "library.js"), "w", encoding="utf-8") as f:
        f.write(out)
    return len(text)


def read_history(path, fname):
    """和 generate_plans.py 的 load_all_history_databases 保持一致"""
    records = []
    header, actions = None, []
    with open(path, encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if not s:
                continue
            if re.match(r"^\d{1,2}\.\d+", s):
                if header and actions:
                    records.append([header, actions, fname])
                header, actions = s, []
            elif header:
                actions.append(s)
    if header and actions:
        records.append([header, actions, fname])
    return records


def build_history():
    # 优先用「匿名数据/」里的假名版本，避免把真实姓名打进要公开的网页
    anon_dir = os.path.join(ROOT, "匿名数据")
    base = anon_dir if os.path.isdir(anon_dir) else ROOT
    # 与 python 的 sorted(glob("*月.txt"), reverse=True) 顺序一致
    names = sorted(
        [n for n in os.listdir(base) if re.fullmatch(r".*月\.txt", n)], reverse=True
    )
    records = []
    for name in names:
        records.extend(read_history(os.path.join(base, name), name))

    out = (
        "// 由 匿名数据/*月.txt 自动生成（假名），网页版用它做历史兜底\n"
        "// 真实历史请在页面上点「导入我的历史」，只在本机浏览器解析\n"
        "// 改了历史档案后重新运行 python3 tools/build-library.py\n"
        "window.JL_HISTORY = " + json.dumps(records, ensure_ascii=False) + ";\n"
    )
    with open(os.path.join(WEB, "assets", "history.js"), "w", encoding="utf-8") as f:
        f.write(out)
    return len(records), records


if __name__ == "__main__":
    chars = build_library()
    count, _ = build_history()
    print(f"已生成 assets/library.js（{chars} 字符）")
    print(f"已生成 assets/history.js（{count} 条历史记录）")
