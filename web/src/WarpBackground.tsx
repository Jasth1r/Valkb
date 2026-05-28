import { useEffect, useRef } from "react"

type Star = {
  x: number
  y: number
  px: number
  py: number
  vx: number
  vy: number
  speed: number
  r: number
  life: number
  hue: number
  sat: number
}

export default function WarpBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animId = 0
    // 粒子总数。越大越密；> 2000 低端机可能掉帧
    const NUM = 1800
    let W = 0
    let H = 0
    let cx = 0
    let cy = 0
    let stars: Star[] = []

    function mkStar(): Star {
      const angle = Math.random() * Math.PI * 2
      // 出生点距中心的像素半径（2~8）。调大 → 中心出现"空洞"；调小 → 起点更集中
      const startDist = 4 + Math.random() * 7
      const dx = Math.cos(angle)
      const dy = Math.sin(angle)
      const x = cx + dx * startDist
      const y = cy + dy * startDist
      return {
        x,
        y,
        px: x,
        py: y,
        vx: dx,
        vy: dy,
        // 每颗星的基础速度（0.5~0.9）。范围越宽快慢差别越明显，越窄越整齐
        speed: 0.6 + Math.random() * 0.7,
        // 线条粗细基数（2.0~2.9）。整体放大就两个数一起加，例如 3.0 + random*1.5
        r: 2.0 + Math.random() * 0.9,
        life: 0,
        // 色相：0=红、30=橙、60=黄。当前 0~30 = 红到橙
        //   纯红：Math.random() * 10
        //   品红偏红：340 + Math.random() * 20，但 HSL 要取模 → ((340 + Math.random()*20) % 360)
        //   蓝色就 200~240，紫色 270~300
        hue: Math.random() * 30,
        // 饱和度 %（80~100）。降到 30~50 会变"白雾"风格；100 最艳
        sat: 70 + Math.random() * 25,
      }
    }

    function resize() {
      if (!canvas) return
      W = canvas.width = canvas.offsetWidth
      H = canvas.height = canvas.offsetHeight
      cx = W / 2
      cy = H / 2
    }

    function init() {
      resize()
      stars = Array.from({ length: NUM }, mkStar)
    }

    function draw() {
      if (!ctx) return
      // ★ 拖尾长度的总开关 ★
      // 每帧用半透明黑色"擦"一次屏幕。alpha 越小 → 旧轨迹保留越久 → 尾巴越长
      //   0.04 = 极长尾，几乎不消散    0.08 = 当前长尾感
      //   0.18 = 短促划线              0.30+ = 几乎没尾，像点阵
      ctx.fillStyle = "rgba(0,0,0,0.08)"
      ctx.fillRect(0, 0, W, H)

      for (const s of stars) {
        s.px = s.x
        s.py = s.y
        const dist = Math.hypot(s.x - cx, s.y - cy)
        // 离中心越远加速越快（warp 跃迁感的核心公式）
        //   0.45 = 屏幕短边 45% 处 accel ≈ 2×。调小 → 更早开始加速
        //   1.6  = 加速曲线陡峭度。越大越"突然冲出去"，越小越线性
        const accel = 1 + Math.pow(dist / (Math.min(W, H) * 0.45), 1.6)
        // ★ 全局速度倍率 = 1.5 ★ 想整体更快/更慢只动这一个数（1.0 偏慢、2.5 飞快）
        s.x += s.vx * s.speed * 1.5 * accel
        s.y += s.vy * s.speed * 1.5 * accel
        s.life++

        // 刚出生时淡入：8 帧达到全不透明。调大 → 出现更柔；改成 1 → 瞬出
        const alpha = Math.min(s.life / 8, 1)
        // 这一帧实际位移长度。同时驱动下面的"亮度"和"线宽"
        const len = Math.hypot(s.x - s.px, s.y - s.py)
        // 越快越亮（40%~100%）。底数 40 = 远离中心前的最低亮度；乘 3 = 速度影响强度
        const brightness = Math.min(40 + len * 3, 100)

        ctx.beginPath()
        ctx.moveTo(s.px, s.py)
        ctx.lineTo(s.x, s.y)
        ctx.strokeStyle = `hsla(${s.hue}, ${s.sat}%, ${brightness}%, ${alpha})`
        // 线宽 = r × (0.5 + 速度 × 0.04)
        //   0.5 调大 → 整体更"实心"、近中心也是粗线
        //   0.04 调大 → 远处线条更夸张地变粗
        ctx.lineWidth = s.r * (0.5 + len * 0.04)
        ctx.stroke()

        // 飞出屏幕外 20px 就重生。改成 0 = 刚一出界就重生（边缘有点突兀）
        if (s.x < -20 || s.x > W + 20 || s.y < -20 || s.y > H + 20) {
          Object.assign(s, mkStar())
        }
      }
      animId = requestAnimationFrame(draw)
    }

    init()
    draw()
    window.addEventListener("resize", resize)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
      }}
    />
  )
}
