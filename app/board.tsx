"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowDownToLine, ArrowUpFromLine, BadgeAlert, Check, ChevronRight, CircleHelp, FileImage,
  Layers, ListFilter, MessageSquare, Plus, RefreshCw, ScanLine, Search, ShieldAlert,
  Sparkles, Star, ThumbsDown, ThumbsUp, Trash2, UserRound, X,
} from "lucide-react";
import { fromCsv, fromText, recognizeImage } from "./imports";
import { IMPORT_LIMIT, NAME_LIMIT, nameKey, NOTE_LIMIT } from "./model";
import type { BoardData, Draft, Entry, Kind } from "./model";
import { assetPath, request } from "./board-client";

const kinds = { red: "红榜", black: "黑榜" };
const initial: BoardData = { entries: [], identity: null };
const byRecent = (a: Entry, b: Entry) => b.created_at - a.created_at;
const sorters = {
  recent: byRecent,
  rating: (a: Entry, b: Entry) => (b.rating ?? -1) - (a.rating ?? -1) || byRecent(a, b),
  vote: (a: Entry, b: Entry) => (b.up - b.down) - (a.up - a.down) || b.up - a.up || byRecent(a, b),
  name: (a: Entry, b: Entry) => a.name.localeCompare(b.name, "zh-CN"),
};
type Sort = keyof typeof sorters;
type Modal = "entry" | "import" | "identity" | "delete";
type Preview = { id: string; pinned: boolean; top: number; left: number; bottom: number; above: boolean };
const formatDate = (value: number) => new Intl.DateTimeFormat("zh-HK", { month: "numeric", day: "numeric" }).format(value);

function KindButtons({ value, onChange }: { value: Draft["kind"]; onChange: (kind: Kind) => void }) {
  return <div className="kind-buttons" role="group" aria-label="选择榜单">
    {(["red", "black"] as const).map(kind =>
      <button key={kind} type="button" className={`pill ${kind}`} aria-pressed={value === kind} onClick={() => onChange(kind)}>
        {kind === "red" ? <ThumbsUp size={15} /> : <ShieldAlert size={15} />}{kinds[kind]}
      </button>
    )}
  </div>;
}

function Dialog({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={wide ? "dialog dialog-wide" : "dialog"} aria-labelledby="dialog-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.currentTarget === event.target) onClose(); }}>
    <div className="dialog-content">
      <header className="dialog-head"><h2 id="dialog-title">{title}</h2><button type="button" className="icon-button" aria-label="关闭" onClick={onClose}><X size={20} /></button></header>
      {children}
    </div>
  </dialog>;
}

export default function Board() {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Kind | "all">("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [onlyMine, setOnlyMine] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const [modalError, setModalError] = useState("");
  const [nickname, setNickname] = useState("");
  const [entry, setEntry] = useState<Draft>({ name: "", kind: "red", note: "" });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [raw, setRaw] = useState("");
  const [isTable, setIsTable] = useState(false);
  const [importMode, setImportMode] = useState<"image" | "csv">("image");
  const [filename, setFilename] = useState("");
  const [progress, setProgress] = useState({ text: "", value: 0 });
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [note, setNote] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [deleteId, setDeleteId] = useState("");
  const hoverTimer = useRef<number>(0);
  const toastTimer = useRef<number>(0);
  const followup = useRef<(() => void) | null>(null);
  const scanningRef = useRef(false);
  const busyRef = useRef(false);
  const requestVersion = useRef(0);
  const anchor = useRef<HTMLButtonElement>(null);
  const previewRef = useRef<HTMLElement>(null);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const next = await request<BoardData>();
      if (version === requestVersion.current) { setData(next); setLoadError(""); }
    } catch (error) {
      if (version === requestVersion.current) setLoadError((error as Error).message);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(refresh, 0);
    function onVisible() { if (document.visibilityState === "visible") void refresh(); }
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener("focus", onVisible);
      window.clearTimeout(hoverTimer.current);
      window.clearTimeout(toastTimer.current);
    };
  }, [refresh]);

  const previewId = preview?.id;
  const previewPinned = preview?.pinned;
  useEffect(() => {
    if (!previewId) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !previewRef.current?.contains(event.target) && !anchor.current?.contains(event.target)) setPreview(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        setPreview(null);
        if (previewPinned) anchor.current?.focus();
      }
    }
    function updatePosition() {
      const button = anchor.current;
      if (!button?.isConnected) { setPreview(null); return; }
      if (!previewPinned) { setPreview(null); return; }
      const position = positionOf(button);
      setPreview(current => current && current.id === previewId ? { ...current, ...position } : current);
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
    };
  }, [previewId, previewPinned]);

  function notify(message: string) {
    setStatus(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setStatus(""), 4000);
  }

  function closeModal() {
    if (busyRef.current || scanningRef.current) return;
    followup.current = null;
    setModal(null);
    setModalError("");
  }

  function showIdentity(after?: () => void) {
    followup.current = after ?? null;
    setNickname(data.identity?.name ?? "");
    setModalError("");
    setModal("identity");
  }

  function withIdentity(fn: () => void) {
    if (data.identity) fn();
    else showIdentity(fn);
  }

  function add(kind: Kind) {
    setPreview(null);
    setModalError("");
    setEntry({ name: "", kind, note: "" });
    setModal("entry");
  }

  function startImport(mode: "image" | "csv") {
    setPreview(null);
    setModalError("");
    setRaw("");
    setIsTable(false);
    setDrafts([]);
    setFilename("");
    setProgress({ text: "", value: 0 });
    setImportMode(mode);
    setModal("import");
  }

  async function mutate(payload: Record<string, unknown>, done?: (result: { added: number; skipped: number }) => void, inDialog = false) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setModalError("");
    try {
      const result = await request<{ added: number; skipped: number }>("POST", payload);
      await refresh();
      done?.(result);
    } catch (error) {
      const message = (error as Error).message;
      if (inDialog) setModalError(message);
      else notify(message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function positionOf(node: HTMLElement) {
    const box = node.getBoundingClientRect();
    const above = box.top >= 450 && box.bottom + 400 > window.innerHeight;
    return {
      left: Math.max(12, Math.min(box.left, window.innerWidth - 416)),
      top: Math.max(12, box.bottom + 8),
      bottom: Math.max(12, window.innerHeight - box.top + 8),
      above,
    };
  }

  function openPreview(item: Entry, target: HTMLButtonElement, pinned: boolean) {
    window.clearTimeout(hoverTimer.current);
    if (!pinned && preview?.pinned) return;
    if (pinned && preview?.pinned && preview.id === item.id) { setPreview(null); return; }
    if (preview?.id !== item.id) {
      setEditingNote(false);
      setNote(item.myNote);
    }
    anchor.current = target;
    setPreview({ id: item.id, pinned, ...positionOf(target) });
  }

  function closeHover() {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setPreview(current => current?.pinned ? current : null), 240);
  }

  function saveDrafts(rows: Draft[], single = false) {
    if (rows.some(row => !nameKey(row.name) || !row.kind)) { setModalError("请为每条记录填写团名并选择红榜或黑榜"); return; }
    if (single && data.entries.some(item => nameKey(item.name) === nameKey(rows[0].name))) {
      setModalError("该团牌已在榜，可搜索团名并补充评价");
      return;
    }
    withIdentity(() => {
      if (!data.identity) setModal(single ? "entry" : "import");
      void mutate({ action: "add", drafts: rows }, ({ added, skipped }) => {
        if (single && !added) { setModalError("团牌已存在，或榜单已达到上限"); return; }
        setModal(null);
        setQuery("");
        setOnlyMine(false);
        setFilter(single ? rows[0].kind || "all" : "all");
        notify(`已加入 ${added} 条团牌${skipped ? `，跳过 ${skipped} 条重名或超出上限的记录` : ""}`);
      }, true);
    });
  }

  async function loadImport(file: File) {
    if (scanningRef.current) return;
    if (file.size > 12 * 1024 * 1024) { setModalError("请选择 12 MB 以内的文件"); return; }
    if (importMode === "image" && !/\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name) && !/^image\/(png|jpeg|webp|bmp|gif)$/.test(file.type)) {
      setModalError("请选择 PNG、JPG、WebP、BMP 或 GIF 图片");
      return;
    }
    scanningRef.current = true;
    setScanning(true);
    setModalError("");
    setRaw("");
    setIsTable(false);
    setDrafts([]);
    setFilename(file.name);
    setProgress({ text: "", value: 0 });
    try {
      if (importMode === "csv") {
        const parsed = fromCsv(await file.text());
        setDrafts(parsed);
        if (!parsed.length) setModalError("没有读到团牌。CSV 每行应包含分类、团牌名称和评价");
      } else {
        const { text, table } = await recognizeImage(file, (message, value) =>
          setProgress(current => ({ text: message, value: Math.max(current.value, value) })));
        setRaw(text.trim());
        setIsTable(Boolean(table));
        setDrafts(table ?? fromText(text));
        setProgress({ text: "", value: 0 });
        if (!text.trim()) setModalError("未识别到文字，可以换图或手动添加条目");
      }
    } catch (error) {
      setModalError((error as Error).message || "读取失败，请更换文件后重试");
      setProgress({ text: "", value: 0 });
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
  }

  const key = query.trim().toLowerCase();
  const visible = data.entries.filter(item =>
    (!onlyMine || item.mine) && (!key ||
      [item.name, item.author, ...item.reviews.flatMap(review => [review.name, review.note])]
        .some(value => value.toLowerCase().includes(key)))).sort(sorters[sort]);
  const counts = {
    red: data.entries.filter(item => item.kind === "red").length,
    black: data.entries.filter(item => item.kind === "black").length,
  };
  const active = preview && data.entries.find(item => item.id === preview.id);
  const votes = data.entries.reduce((total, item) => total + item.ratingCount, 0);
  const average = votes ? (data.entries.reduce((total, item) => total + (item.rating ?? 0) * item.ratingCount, 0) / votes).toFixed(1) : "—";

  function download() {
    const rows = visible.filter(item => filter === "all" || filter === item.kind);
    const csvCell = (value: string | number) => {
      const text = String(value);
      const escaped = /^[\s]*[=+@\-]/.test(text) ? "'" + text : text;
      return '"' + escaped.replace(/"/g, '""') + '"';
    };
    const content = rows.map(item => [
      kinds[item.kind], item.name, item.reviews.map(review => `${review.name}：${review.note}`).join("\n"),
      item.up, item.down, item.rating?.toFixed(1) ?? "", item.ratingCount, item.author,
    ].map(csvCell).join(","));
    const url = URL.createObjectURL(new Blob(["\ufeff分类,团牌名称,评价,推荐,避雷,评分,评分人数,发布人\r\n", content.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "团牌红黑榜.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(`已导出 ${rows.length} 条记录`);
  }

  function entryAction(item: Entry, action: string, value: unknown) {
    setPreview(current => current ? { ...current, pinned: true } : current);
    withIdentity(() => void mutate({ action, id: item.id, value }, () => {
      if (action === "note") { setEditingNote(false); notify(value ? "评价已保存" : "评价已清除"); }
    }));
  }

  return <>
    <header className="site-header">
      <div className="site-bar">
        <a href={assetPath()} className="brand"><span className="brand-mark"><i/><i/></span><span>团牌<span className="brand-accent">红黑榜</span></span></a>
        <button className="button quiet identity" onClick={() => showIdentity()}><UserRound size={17} /><span>{data.identity?.name || "设置昵称"}</span></button>
      </div>
    </header>
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <h1>团牌红黑榜</h1>
          <p>开团前查评价，打完团记体验。</p>
          <div className="hero-actions">
            <button className="button primary" onClick={() => add(filter === "black" ? "black" : "red")}><Plus size={20}/>添加团牌</button>
            <button className="button frost" onClick={() => startImport("image")}><ScanLine size={19}/>图片识别导入</button>
          </div>
        </div>
        <div className="illustration" aria-hidden="true">
          <i className="orbit first"/><i className="orbit second"/><i className="orbit third"/>
          <div className="hero-tile hero-tile-black"><ShieldAlert size={42} strokeWidth={1.3}/><span>黑</span><i/></div>
          <div className="hero-tile hero-tile-red"><Sparkles size={42} strokeWidth={1.3}/><span>红</span><i/></div>
        </div>
      </section>

      <section className="stats" aria-label="榜单概况">
        <div><span className="metric-icon red"><ThumbsUp size={19}/></span><span>红榜团牌<strong>{loading ? "—" : counts.red}</strong></span></div>
        <div><span className="metric-icon black"><ShieldAlert size={19}/></span><span>黑榜团牌<strong>{loading ? "—" : counts.black}</strong></span></div>
        <div><span className="metric-icon gold"><Star size={19}/></span><span>指挥平均分<strong>{average}<small>{votes ? " / 10" : ""}</small></strong></span></div>
      </section>

      <aside className="platform-notice" aria-label="平台声明">
        <strong>平台声明</strong>
        <p>本平台仅提供发布功能，不做审核，推荐/避雷的个人意见仅供参考。引战内容会做后台删除。</p>
      </aside>

      <section className="browse" aria-labelledby="browse-heading">
        <div className="browse-title">
          <h2 id="browse-heading">浏览榜单</h2>
          <div className="file-actions">
            <button className="text-button" onClick={() => startImport("csv")}><ArrowUpFromLine size={15}/>导入 CSV</button>
            <button className="text-button" onClick={download}><ArrowDownToLine size={15}/>导出 CSV</button>
          </div>
        </div>
        <div className="filter-line">
          <div className="tabs" role="group" aria-label="按榜单筛选">
            {(["all", "red", "black"] as const).map(kind => <button key={kind} type="button" aria-pressed={filter === kind} onClick={() => { setFilter(kind); setPreview(null); }}>
              {kind === "all" ? "全部" : kinds[kind]}<span>{kind === "all" ? data.entries.length : counts[kind]}</span>
            </button>)}
          </div>
          <label className="search"><Search size={19}/><input aria-label="搜索团牌或评价" type="search" placeholder="搜索团牌、评价或发布人" value={query} onChange={event => { setQuery(event.target.value); setPreview(null); }}/></label>
        </div>
        <div className="sort-line" role="group" aria-label="排序与筛选">
          <ListFilter size={17} aria-hidden="true"/>
          {([["recent", "最近添加"], ["rating", "评分最高"], ["vote", "推荐最多"], ["name", "按名称"]] as [Sort, string][]).map(([value, label]) =>
            <button key={value} type="button" className="pill" aria-pressed={sort === value} onClick={() => { setSort(value); setPreview(null); }}>{label}</button>
          )}
          {data.identity && <button type="button" className="pill mine" aria-pressed={onlyMine} onClick={() => { setOnlyMine(!onlyMine); setPreview(null); }}><UserRound size={15}/>只看我发的</button>}
        </div>
        {loadError && <div className="load-state" role="alert"><BadgeAlert size={20}/>{loadError}<button className="button quiet" onClick={() => void refresh()}><RefreshCw size={15}/>重试</button></div>}
        {loading && <div className="load-state" role="status">正在加载团牌…</div>}
        {!loading && !loadError && <div className={`boards ${filter !== "all" ? "one-board" : ""}`}>
          {(["red", "black"] as const).filter(kind => filter === "all" || filter === kind).map(kind => {
            const items = visible.filter(item => item.kind === kind);
            const Icon = kind === "red" ? ThumbsUp : ShieldAlert;
            const empty = !items.length;
            return <section key={kind} className={`board ${kind}`} aria-label={kinds[kind]}>
              <div className="board-head">
                <span className="board-symbol"><Icon size={20}/></span>
                <div><h3>{kinds[kind]}</h3><p>{kind === "red" ? "值得推荐的团牌" : "需要留意的团牌"}</p></div>
                <span className="board-count">{items.length} 个</span>
              </div>
              {empty ? <div className="empty">
                <span className="empty-icon"><Layers size={27} strokeWidth={1.5}/></span>
                <strong>{key || onlyMine ? "没有匹配的团牌" : `暂无${kinds[kind]}团牌`}</strong>
                {!key && !onlyMine && <button className="button empty-button" onClick={() => add(kind)}><Plus size={16}/>添加团牌</button>}
              </div> : <div className="card-grid">
                {items.map(item => <button key={item.id} type="button" className="entry-card" aria-haspopup="dialog" aria-expanded={preview?.id === item.id}
                  onPointerEnter={event => { if (event.pointerType === "mouse") openPreview(item, event.currentTarget, false); }}
                  onPointerLeave={closeHover}
                  onClick={event => openPreview(item, event.currentTarget, true)}>
                  <span className="entry-mark">{Array.from(item.name)[0]}</span>
                  <span className="entry-text"><strong>{item.name}</strong><small><Star size={12}/>{item.rating?.toFixed(1) ?? "—"}<MessageSquare size={12}/>{item.reviews.length}</small></span>
                  <ChevronRight size={15} className="entry-chevron"/>
                </button>)}
              </div>}
            </section>;
          })}
        </div>}
      </section>
      <footer><span><CircleHelp size={15}/>悬停或点按团牌查看评价</span><span>团牌红黑榜</span></footer>
    </main>

    {active && preview && <aside ref={previewRef} role="dialog" aria-label={`${active.name}的评价`} className={`popover ${active.kind}`}
      style={{ left: preview.left, top: preview.above ? "auto" : Math.min(preview.top, window.innerHeight - 190), bottom: preview.above ? preview.bottom : "auto",
        maxHeight: Math.max(170, preview.above ? window.innerHeight - preview.bottom - 12 : window.innerHeight - Math.min(preview.top, window.innerHeight - 190) - 12) }}
      onPointerEnter={() => window.clearTimeout(hoverTimer.current)} onPointerLeave={closeHover}>
      <div className="popover-head">
        <div><div className="popover-kind">{kinds[active.kind]}</div><h3>{active.name}</h3><p>{active.author} 发布 · {formatDate(active.created_at)}</p></div>
        <button className="icon-button" aria-label="关闭评价" onClick={() => { setPreview(null); anchor.current?.focus(); }}><X size={18}/></button>
      </div>
      <div className="reaction">
        <button className="pill red" disabled={busy} aria-pressed={active.myVote === 1} onClick={() => entryAction(active, "vote", active.myVote === 1 ? 0 : 1)}><ThumbsUp size={15}/>推荐 {active.up}</button>
        <button className="pill black" disabled={busy} aria-pressed={active.myVote === -1} onClick={() => entryAction(active, "vote", active.myVote === -1 ? 0 : -1)}><ThumbsDown size={15}/>避雷 {active.down}</button>
      </div>
      <div className="ratings">
        <strong><Star size={16}/>指挥评分 <b>{active.rating?.toFixed(1) ?? "—"}</b><span>{active.ratingCount} 人评分</span></strong>
        <div className="rating-buttons" role="group" aria-label="指挥评分，重复点击可撤销">
          {Array.from({ length: 10 }, (_, i) => i + 1).map(value => <button key={value} className="pill" aria-label={`${value} 分`} aria-pressed={active.myRating === value} disabled={busy}
            onClick={() => entryAction(active, "rating", active.myRating === value ? null : value)}>{value}</button>)}
        </div>
      </div>
      <div className="reviews">
        <header><strong>团友评价 <span>{active.reviews.length}</span></strong><button className="text-button" onClick={() => {
          setPreview(current => current ? { ...current, pinned: true } : current);
          withIdentity(() => setEditingNote(true));
        }}><Plus size={15}/>{active.myNote ? "编辑我的评价" : "写评价"}</button></header>
        {editingNote && <form onSubmit={event => { event.preventDefault(); entryAction(active, "note", note); }}>
          <textarea aria-label="我的评价" maxLength={NOTE_LIMIT} value={note} onChange={event => setNote(event.target.value)} placeholder="分享这次跟团体验"/>
          <div className="form-actions"><button type="button" className="button quiet" onClick={() => { setNote(active.myNote); setEditingNote(false); }}>取消</button><button className="button solid" disabled={busy}>{note.trim() ? "保存评价" : "清除评价"}</button></div>
        </form>}
        {!active.reviews.length && <p className="muted">还没有文字评价</p>}
        {active.reviews.map((review, i) => <article className="review" key={i}>
          <span className="avatar">{Array.from(review.name)[0]}</span>
          <div><strong>{review.name}</strong> {review.mine && <small>我</small>}<p>{review.note}</p></div>
        </article>)}
      </div>
      {active.mine && <div className="entry-tools">
        <button className="text-button" disabled={busy} onClick={() => void mutate({ action: "move", id: active.id, kind: active.kind === "red" ? "black" : "red" }, () => { setPreview(null); notify("已移动团牌"); })}>移到{kinds[active.kind === "red" ? "black" : "red"]}</button>
        <button className="text-button" onClick={() => { setDeleteId(active.id); setModal("delete"); setModalError(""); }}><Trash2 size={15}/>删除团牌</button>
      </div>}
    </aside>}

    {modal === "identity" && <Dialog title={data.identity ? "修改昵称" : "设置昵称"} onClose={closeModal}>
      <form className="stack" onSubmit={(event: FormEvent) => {
        event.preventDefault();
        const after = followup.current;
        void mutate({ action: "identity", name: nickname }, () => {
          followup.current = null;
          setModal(null);
          notify("昵称已保存");
          if (after) queueMicrotask(after);
        }, true);
      }}>
        <p className="muted">昵称会显示在你发布的团牌和评价下，本浏览器会记住你的身份。</p>
        <label className="field">昵称<input autoFocus required maxLength={18} value={nickname} onChange={event => setNickname(event.target.value)} placeholder="输入昵称"/></label>
        {modalError && <p className="error" role="alert">{modalError}</p>}
        <div className="form-actions"><button className="button quiet" type="button" onClick={closeModal}>取消</button><button className="button solid" disabled={busy}>保存昵称</button></div>
      </form>
    </Dialog>}

    {modal === "entry" && <Dialog title="添加团牌" onClose={closeModal}>
      <form className="stack" onSubmit={event => { event.preventDefault(); saveDrafts([entry], true); }}>
        <div className="field">选择榜单<KindButtons value={entry.kind} onChange={kind => setEntry({ ...entry, kind })}/></div>
        <label className="field">团牌名称<input autoFocus required maxLength={NAME_LIMIT} placeholder="输入团牌名称" value={entry.name} onChange={event => setEntry({ ...entry, name: event.target.value })}/></label>
        <label className="field">跟团评价 <span className="muted">选填</span><textarea maxLength={NOTE_LIMIT} placeholder="描述指挥、沟通或团队体验" value={entry.note} onChange={event => setEntry({ ...entry, note: event.target.value })}/></label>
        {modalError && <p className="error" role="alert">{modalError}</p>}
        <div className="form-actions"><button className="button quiet" type="button" onClick={closeModal}>取消</button><button className="button solid" disabled={busy}>加入{entry.kind ? kinds[entry.kind] : "榜单"}</button></div>
      </form>
    </Dialog>}

    {modal === "import" && <Dialog title={importMode === "image" ? "图片识别导入" : "导入 CSV"} onClose={closeModal} wide>
      <div className="stack">
        <p className="muted">{importMode === "image" ? "支持普通文字图片和含「目标」「原因」的名单表格。图片在浏览器内识别，校对后再入榜。" : "上传含分类、团牌名称、评价的 CSV，校对后再入榜。"}</p>
        <label className={`drop-zone ${scanning ? "scanning" : ""}`}
          onDragOver={event => event.preventDefault()}
          onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void loadImport(file); }}>
          <input type="file" accept={importMode === "image" ? "image/png,image/jpeg,image/webp,image/bmp,image/gif" : ".csv,text/csv"} disabled={scanning}
            aria-label={importMode === "image" ? "选择待识别图片" : "选择 CSV 文件"}
            onChange={event => { const file = event.target.files?.[0]; if (file) void loadImport(file); event.target.value = ""; }}/>
          {importMode === "image" ? <FileImage size={25}/> : <ArrowUpFromLine size={23}/>}
          <strong>{filename || "选择文件或拖到这里"}</strong><span>{importMode === "image" ? "PNG、JPG、WebP 等 · 12 MB 以内" : "UTF-8 CSV · 12 MB 以内"}</span>
        </label>
        {scanning && <div role="status" className="progress"><span>{progress.text || "正在读取文件"}</span><progress max={1} value={progress.value}/></div>}
        {isTable && !scanning && <p className="muted" role="status">已按名单表格提取 {drafts.length} 条，请核对团名和评价。</p>}
        {importMode === "image" && !scanning && (raw || filename) && <details className="raw">
          <summary>{isTable ? "查看或修正提取文本" : "查看或修正识别原文"}</summary>
          <textarea aria-label="识别原文" value={raw} onChange={event => setRaw(event.target.value)} placeholder={"好评：团名｜评价\n避雷：团名｜评价"}/>
          <button className="button quiet" type="button" onClick={() => { setDrafts(fromText(raw)); setModalError(""); }}>重新生成条目</button>
        </details>}
        {!scanning && <div className="drafts">
          {drafts.map((row, index) => <div className="draft-row" key={index}>
            <div className="draft-head"><KindButtons value={row.kind} onChange={kind => setDrafts(c => c.map((item, i) => i === index ? { ...item, kind } : item))}/>
              <button className="icon-button" aria-label={`移除第 ${index + 1} 条`} onClick={() => setDrafts(c => c.filter((_, i) => i !== index))}><X size={18}/></button>
            </div>
            {row.needsReview && <p className="muted draft-review">建议对照图片核对本条文字</p>}
            <input className="input" aria-label={`第 ${index + 1} 条团名`} maxLength={NAME_LIMIT} placeholder="团牌名称" value={row.name}
              onChange={event => setDrafts(c => c.map((item, i) => i === index ? { ...item, name: event.target.value } : item))}/>
            <textarea aria-label={`第 ${index + 1} 条评价`} maxLength={NOTE_LIMIT} placeholder="评价（选填）" value={row.note}
              onChange={event => setDrafts(c => c.map((item, i) => i === index ? { ...item, note: event.target.value } : item))}/>
          </div>)}
        </div>}
        {modalError && <p className="error" role="alert">{modalError}</p>}
        <div className="form-actions">
          <button className="button quiet" disabled={scanning || drafts.length >= IMPORT_LIMIT} onClick={() => setDrafts(c => [...c, { name: "", kind: "", note: "" }])}><Plus size={16}/>补一条</button>
          <button className="button solid" disabled={busy || scanning || !drafts.length} onClick={() => saveDrafts(drafts)}><Check size={16}/>确认导入{drafts.length ? ` ${drafts.length} 条` : ""}</button>
        </div>
      </div>
    </Dialog>}

    {modal === "delete" && <Dialog title="删除团牌" onClose={closeModal}>
      <div className="stack"><p>确定删除「{data.entries.find(item => item.id === deleteId)?.name}」及其评价和投票？</p>
        {modalError && <p className="error" role="alert">{modalError}</p>}
        <div className="form-actions"><button className="button quiet" onClick={closeModal}>取消</button><button className="button solid" disabled={busy}
          onClick={() => void mutate({ action: "delete", id: deleteId }, () => { setModal(null); setPreview(null); notify("团牌已删除"); }, true)}>确认删除</button></div>
      </div>
    </Dialog>}
    {status && <div className="toast" role="status">{status}</div>}
  </>;
}
