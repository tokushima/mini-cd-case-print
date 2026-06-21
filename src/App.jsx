import React, { useEffect, useRef, useState } from 'react'

// ---- 印刷仕様 ----
const DPI = 300
const MM_PER_INCH = 25.4
const mm = (v) => Math.round((v / MM_PER_INCH) * DPI) // mm -> px (300dpi)

// L版: 89 x 127 mm
const PAGE = { w: mm(89), h: mm(127) }

// mm指定のフレーム定義をpx座標付きに変換
const toPx = (f) => ({
  shape: 'rect',
  ...f,
  x: mm(f.xmm),
  y: mm(f.ymm),
  w: mm(f.wmm),
  h: mm(f.hmm),
  hole: f.holemm ? mm(f.holemm) : 0,
})

// モード1: 表裏セット（上段に41x41を2枚、下段に37x55を2枚）
const FRAMES_SET = [
  { id: 'sq1', label: '表①', xmm: 2,  ymm: 8,  wmm: 41, hmm: 41 },
  { id: 'rc1', label: '裏①', xmm: 5,  ymm: 64, wmm: 37, hmm: 55 },
  { id: 'sq2', label: '表②', xmm: 46, ymm: 8,  wmm: 41, hmm: 41 },
  { id: 'rc2', label: '裏②', xmm: 47, ymm: 64, wmm: 37, hmm: 55 },
].map(toPx)

// モード2: 丸型ディスク（外径37mm・中心穴6mm を 2×2 配置）
const FRAMES_DISC = [
  { id: 'd1', label: 'ディスク①', shape: 'disc', xmm: 4,  ymm: 20, wmm: 37, hmm: 37, holemm: 6 },
  { id: 'd2', label: 'ディスク②', shape: 'disc', xmm: 48, ymm: 20, wmm: 37, hmm: 37, holemm: 6 },
  { id: 'd3', label: 'ディスク③', shape: 'disc', xmm: 4,  ymm: 70, wmm: 37, hmm: 37, holemm: 6 },
  { id: 'd4', label: 'ディスク④', shape: 'disc', xmm: 48, ymm: 70, wmm: 37, hmm: 37, holemm: 6 },
].map(toPx)

const LAYOUTS = {
  set: { name: '表裏セット', desc: '41×41mm ×2 ／ 37×55mm ×2', frames: FRAMES_SET },
  disc: { name: '丸型ディスク', desc: '外径37mm・中心穴6mm ×4', frames: FRAMES_DISC },
}

const emptySlot = () => ({ img: null, name: '', zoom: 1, minZoom: 1, offsetX: 0, offsetY: 0, rotation: 0 })

// cover基準のzoom=1に対し、写真全体が枠内に収まる倍率（contain）を返す
const containZoom = (frame, img) => {
  const cover = Math.max(frame.w / img.naturalWidth, frame.h / img.naturalHeight)
  const contain = Math.min(frame.w / img.naturalWidth, frame.h / img.naturalHeight)
  return contain / cover // <= 1
}

// 1フレーム分の描画パラメータ（frame.x/y を基準に算出）
function computeDraw(frame, slot) {
  const { img, zoom, offsetX, offsetY, rotation = 0 } = slot
  const base = Math.max(frame.w / img.naturalWidth, frame.h / img.naturalHeight) // cover
  const scale = base * zoom
  const drawW = img.naturalWidth * scale
  const drawH = img.naturalHeight * scale
  // 回転後のバウンディングボックスで、枠を覆う範囲にオフセットをクランプ
  const rad = (rotation * Math.PI) / 180
  const c = Math.abs(Math.cos(rad))
  const s = Math.abs(Math.sin(rad))
  const boundW = drawW * c + drawH * s
  const boundH = drawW * s + drawH * c
  const maxOX = Math.max(0, (boundW - frame.w) / 2)
  const maxOY = Math.max(0, (boundH - frame.h) / 2)
  const ox = Math.max(-maxOX, Math.min(maxOX, offsetX))
  const oy = Math.max(-maxOY, Math.min(maxOY, offsetY))
  // 画像中心の配置座標（オフセットは画面座標で適用＝ドラッグ操作と一致）
  const cx = frame.x + frame.w / 2 + ox
  const cy = frame.y + frame.h / 2 + oy
  return { cx, cy, drawW, drawH, rad }
}

// フレームの形状でクリップパスを作る
function framePath(ctx, frame) {
  ctx.beginPath()
  if (frame.shape === 'disc') {
    ctx.arc(frame.x + frame.w / 2, frame.y + frame.h / 2, frame.w / 2, 0, Math.PI * 2)
  } else {
    ctx.rect(frame.x, frame.y, frame.w, frame.h)
  }
}

// 1フレームを描画（中は黒、画像をclip）。guides=true で枠線・ラベル
function paintFrame(ctx, frame, slot, guides) {
  ctx.save()
  framePath(ctx, frame)
  ctx.clip()
  ctx.fillStyle = '#000000' // 形状の中は黒
  ctx.fillRect(frame.x, frame.y, frame.w, frame.h)
  if (slot.img) {
    const { cx, cy, drawW, drawH, rad } = computeDraw(frame, slot)
    ctx.save()
    ctx.translate(cx, cy)
    if (rad) ctx.rotate(rad)
    ctx.drawImage(slot.img, -drawW / 2, -drawH / 2, drawW, drawH)
    ctx.restore()
  } else if (guides) {
    // アップロード前のプレースホルダー（薄いグレー＋サイズ表記）
    ctx.fillStyle = '#f0f0f3'
    ctx.fillRect(frame.x, frame.y, frame.w, frame.h)
    ctx.fillStyle = '#9aa0a6'
    ctx.font = `${mm(3.5)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const cx = frame.x + frame.w / 2
    if (frame.shape === 'disc') {
      // 中心の白穴と重ならないよう下側に表示（穴6mm / 直径37mm）
      const baseY = frame.y + frame.h * 0.66
      ctx.fillText(`穴${frame.holemm}mm`, cx, baseY)
      ctx.fillText(`直径${frame.wmm}mm`, cx, baseY + mm(5))
    } else {
      ctx.fillText(`${frame.wmm}×${frame.hmm}mm`, cx, frame.y + frame.h / 2)
    }
  }
  ctx.restore()

  // ディスクの中心穴を白で抜く
  if (frame.shape === 'disc' && frame.hole > 0) {
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(frame.x + frame.w / 2, frame.y + frame.h / 2, frame.hole / 2, 0, Math.PI * 2)
    ctx.fill()
  }

  if (guides) {
    ctx.strokeStyle = '#4c8bf5'
    ctx.lineWidth = 3
    framePath(ctx, frame)
    ctx.stroke()
  }
}

// L版ページ全体を描画（背景白）
function renderPage(ctx, frames, slots, guides) {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, PAGE.w, PAGE.h)
  frames.forEach((frame, i) => paintFrame(ctx, frame, slots[i], guides))
}

// 画面幅でモバイル判定
function useIsMobile() {
  const query = '(max-width: 640px)'
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const handler = (e) => setMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return mobile
}

// 共通: マウス/タッチから座標を取り出す
function eventPoint(e, canvas) {
  const rect = canvas.getBoundingClientRect()
  const src = e.touches && e.touches.length ? e.touches[0] : e
  return {
    px: (src.clientX - rect.left) * (canvas.width / rect.width),
    py: (src.clientY - rect.top) * (canvas.height / rect.height),
  }
}

// 1枚編集用キャンバス（フレーム単体を拡大表示）
function FrameEditor({ frame, slot, onChange, onFile }) {
  const ref = useRef(null)
  const drag = useRef(null)
  const localFrame = { ...frame, x: 0, y: 0 } // キャンバス原点に配置

  useEffect(() => {
    const ctx = ref.current.getContext('2d')
    ctx.clearRect(0, 0, frame.w, frame.h)
    paintFrame(ctx, localFrame, slot, !slot.img) // 画像が無い間はプレースホルダー表示
  }) // slot/frame が変わるたび再描画

  const start = (e) => {
    if (!slot.img) return
    const { px, py } = eventPoint(e, ref.current)
    drag.current = { px, py, ox: slot.offsetX, oy: slot.offsetY }
  }
  const move = (e) => {
    if (!drag.current) return
    if (e.cancelable) e.preventDefault()
    const { px, py } = eventPoint(e, ref.current)
    onChange({
      offsetX: drag.current.ox + (px - drag.current.px),
      offsetY: drag.current.oy + (py - drag.current.py),
    })
  }
  const end = () => {
    drag.current = null
  }

  return (
    <div className="editor">
      <label className="file-btn">
        {slot.img ? '📷 写真を変更' : '📷 写真を選択'}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => onFile(e.target.files[0])}
        />
      </label>
      <canvas
        ref={ref}
        width={frame.w}
        height={frame.h}
        className="edit-canvas"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
        onTouchCancel={end}
      />
      {slot.img && (
        <div className="controls">
          <label>
            ズーム
            <input
              type="range"
              min={slot.minZoom}
              max="4"
              step="0.01"
              value={slot.zoom}
              onChange={(e) => onChange({ zoom: parseFloat(e.target.value) })}
            />
          </label>
          <label>
            回転
            <input
              type="range"
              min="-180"
              max="180"
              step="1"
              value={slot.rotation}
              onChange={(e) => onChange({ rotation: parseInt(e.target.value, 10) })}
            />
          </label>
          <div className="ctrl-row">
            <button
              className="reset"
              onClick={() => onChange({ rotation: ((slot.rotation + 90 + 180) % 360) - 180 })}
            >
              ↻ 90°
            </button>
            <button
              className="reset"
              onClick={() => onChange({ zoom: slot.minZoom, offsetX: 0, offsetY: 0, rotation: 0 })}
            >
              リセット
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// モード切替（セグメントボタン）
function ModeSwitch({ mode, onChange }) {
  return (
    <div className="mode-switch">
      {Object.entries(LAYOUTS).map(([key, layout]) => (
        <button
          key={key}
          className={mode === key ? 'active' : ''}
          onClick={() => onChange(key)}
        >
          {layout.name}
        </button>
      ))}
    </div>
  )
}

const OUT_NAME = { set: 'L版_表裏セット', disc: 'L版_丸型ディスク' }
const outName = (mode) => `${OUT_NAME[mode]}_${DPI}dpi.jpg`
const sizeLabel = (frame) =>
  frame.shape === 'disc' ? `直径${frame.wmm}mm` : `${frame.wmm}×${frame.hmm}mm`

export default function App() {
  const [mode, setMode] = useState('set') // 'set' | 'disc'
  const frames = LAYOUTS[mode].frames
  const [slots, setSlots] = useState(() => LAYOUTS.set.frames.map(emptySlot))
  const [step, setStep] = useState(0) // モバイル: 0..(n-1)=編集, n=プレビュー
  const [result, setResult] = useState(null) // { url, blob } モバイル最終JPEG
  const isMobile = useIsMobile()
  const canvasRef = useRef(null) // 全体プレビュー（PC一覧）
  const dragRef = useRef(null)

  // モード切替（スロット・ステップをリセット）
  const switchMode = (m) => {
    if (m === mode) return
    setMode(m)
    setSlots(LAYOUTS[m].frames.map(emptySlot))
    setStep(0)
    setResult(null)
  }

  // PC一覧プレビューの再描画
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    renderPage(canvas.getContext('2d'), frames, slots, true) // ガイド表示
  }, [frames, slots, step, isMobile])

  // モバイル最終ステップ: 出力JPEGを生成して画像として表示（長押し保存用）
  useEffect(() => {
    if (!isMobile || step !== frames.length || !slots.every((s) => s.img)) return
    const out = document.createElement('canvas')
    out.width = PAGE.w
    out.height = PAGE.h
    renderPage(out.getContext('2d'), frames, slots, false)
    out.toBlob(
      (blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        setResult((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url)
          return { url, blob }
        })
      },
      'image/jpeg',
      0.95,
    )
  }, [isMobile, step, frames, slots])

  const handleFile = (index, file) => {
    if (!file) return
    const img = new Image()
    img.onload = () => {
      const minZoom = containZoom(frames[index], img)
      setSlots((prev) => {
        const next = [...prev]
        next[index] = { img, name: file.name, zoom: minZoom, minZoom, offsetX: 0, offsetY: 0, rotation: 0 }
        return next
      })
    }
    img.src = URL.createObjectURL(file)
  }

  const updateSlot = (index, patch) => {
    setSlots((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], ...patch }
      return next
    })
  }

  // ---- PC一覧プレビューでのドラッグ（全フレーム対象）----
  const frameAt = (px, py) =>
    frames.findIndex((f) => px >= f.x && px <= f.x + f.w && py >= f.y && py <= f.y + f.h)

  const startDrag = (e) => {
    const { px, py } = eventPoint(e, canvasRef.current)
    const index = frameAt(px, py)
    if (index < 0 || !slots[index].img) return
    dragRef.current = { index, px, py, ox: slots[index].offsetX, oy: slots[index].offsetY }
  }
  const moveDrag = (e) => {
    const d = dragRef.current
    if (!d) return
    if (e.cancelable) e.preventDefault()
    const { px, py } = eventPoint(e, canvasRef.current)
    updateSlot(d.index, { offsetX: d.ox + (px - d.px), offsetY: d.oy + (py - d.py) })
  }
  const endDrag = () => {
    dragRef.current = null
  }

  const allFilled = slots.every((s) => s.img)

  // モバイル: 共有シート（写真に保存／送信）。使えなければ画像を別タブで開く
  const shareImage = async () => {
    if (!result) return
    const filename = outName(mode)
    const file = new File([result.blob], filename, { type: 'image/jpeg' })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename })
        return
      } catch (err) {
        if (err.name === 'AbortError') return
      }
    }
    // フォールバック: 画像を別タブで開く（長押しで「写真に追加」）
    window.open(result.url, '_blank')
  }

  const download = () => {
    const out = document.createElement('canvas')
    out.width = PAGE.w
    out.height = PAGE.h
    renderPage(out.getContext('2d'), frames, slots, false) // ガイド無し本番
    const filename = outName(mode)
    out.toBlob(
      async (blob) => {
        if (!blob) return
        const file = new File([blob], filename, { type: 'image/jpeg' })
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file] })
            return
          } catch (err) {
            if (err.name === 'AbortError') return
          }
        }
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.target = '_blank'
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 10000)
      },
      'image/jpeg',
      0.95,
    )
  }

  // ============ モバイル: ウィザード ============
  if (isMobile) {
    const editing = step < frames.length
    const frame = frames[step]
    return (
      <div className="app mobile">
        <header>
          <h1>CD風キーホルダー プリント</h1>
        </header>

        <ModeSwitch mode={mode} onChange={switchMode} />

        {editing ? (
          <div className="wizard">
            <div className="step-head">
              <span className="step-no">
                {step + 1} / {frames.length}
              </span>
              <strong>
                {frame.label}（{sizeLabel(frame)}）
              </strong>
            </div>
            <FrameEditor
              frame={frame}
              slot={slots[step]}
              onChange={(p) => updateSlot(step, p)}
              onFile={(f) => handleFile(step, f)}
            />
            {slots[step].img && (
              <p className="hint">写真をドラッグで位置調整／ズームで拡大</p>
            )}
            <div className="nav">
              {step > 0 && (
                <button onClick={() => setStep(step - 1)}>戻る</button>
              )}
              <button
                className="primary"
                disabled={!slots[step].img}
                onClick={() => setStep(step + 1)}
              >
                {step < frames.length - 1 ? '次へ' : 'プレビューへ'}
              </button>
            </div>
          </div>
        ) : (
          <div className="final">
            {result && (
              <img className="preview-img" src={result.url} alt="L版プレビュー" />
            )}
            <p className="hint">
              画像を長押し →「写真に追加」で保存できます
            </p>
            <div className="nav">
              <button onClick={() => setStep(frames.length - 1)}>編集に戻る</button>
              <button className="primary" disabled={!allFilled} onClick={shareImage}>
                保存 / 送信
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ============ PC: 一覧表示 ============
  return (
    <div className="app">
      <header>
        <h1>CD風キーホルダー プリント</h1>
        <p className="sub">
          {LAYOUTS[mode].desc} を L版(89×127mm) に配置 — {DPI}dpi JPG出力
        </p>
      </header>

      <ModeSwitch mode={mode} onChange={switchMode} />

      <div className="main">
        <div className="preview-wrap">
          <canvas
            ref={canvasRef}
            width={PAGE.w}
            height={PAGE.h}
            onMouseDown={startDrag}
            onMouseMove={moveDrag}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
          />
          <p className="hint">写真の上をドラッグで位置調整できます</p>
        </div>

        <div className="panel">
          {frames.map((frame, i) => {
            const slot = slots[i]
            return (
              <div className="slot" key={frame.id}>
                <div className="slot-head">
                  <strong>{frame.label}</strong>
                  <span className="dim">{sizeLabel(frame)}</span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFile(i, e.target.files[0])}
                />
                {slot.img && (
                  <div className="controls">
                    <label>
                      ズーム
                      <input
                        type="range"
                        min={slot.minZoom}
                        max="4"
                        step="0.01"
                        value={slot.zoom}
                        onChange={(e) =>
                          updateSlot(i, { zoom: parseFloat(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      回転
                      <input
                        type="range"
                        min="-180"
                        max="180"
                        step="1"
                        value={slot.rotation}
                        onChange={(e) =>
                          updateSlot(i, { rotation: parseInt(e.target.value, 10) })
                        }
                      />
                    </label>
                    <div className="ctrl-row">
                      <button
                        className="reset"
                        onClick={() =>
                          updateSlot(i, { rotation: ((slot.rotation + 90 + 180) % 360) - 180 })
                        }
                      >
                        ↻ 90°
                      </button>
                      <button
                        className="reset"
                        onClick={() =>
                          updateSlot(i, { zoom: slot.minZoom, offsetX: 0, offsetY: 0, rotation: 0 })
                        }
                      >
                        位置リセット
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          <button className="download" disabled={!allFilled} onClick={download}>
            {allFilled ? 'JPGをダウンロード' : '4枚すべてアップロードしてください'}
          </button>
        </div>
      </div>
    </div>
  )
}
