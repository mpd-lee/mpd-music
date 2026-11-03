import * as THREE from 'three'

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function finish(canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeatX, repeatY)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}

export function createWoodFloorTexture(repeatX = 3, repeatY = 3, tone: 'light' | 'deck' = 'light') {
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d') as CanvasRenderingContext2D
  const rand = seeded(tone === 'light' ? 42 : 7)
  const rows = 12
  const rowH = size / rows
  const palette = tone === 'light'
    ? ['#b98b5f', '#c59a6a', '#ad8055', '#cda77b', '#b58b60']
    : ['#543b28', '#67482d', '#785338', '#5a3f2b', '#805d3e']

  for (let r = 0; r < rows; r++) {
    let x = -rand() * 210
    const rowY = r * rowH
    while (x < size) {
      const len = 190 + rand() * 260
      const lightShift = (rand() - 0.5) * 12
      const plank = g.createLinearGradient(x, rowY, x, rowY + rowH)
      plank.addColorStop(0, palette[Math.floor(rand() * palette.length)])
      plank.addColorStop(0.48, palette[Math.floor(rand() * palette.length)])
      plank.addColorStop(1, tone === 'light' ? '#8f6848' : '#3c291c')
      g.fillStyle = plank
      g.fillRect(x, rowY, len, rowH)
      g.fillStyle = `rgba(255,220,170,${0.04 + rand() * 0.055})`
      g.fillRect(x + 2, rowY + 2, len - 4, 2)
      g.fillStyle = 'rgba(30,18,10,0.28)'
      g.fillRect(x, rowY, 2.5, rowH)
      g.fillRect(x + len - 2, rowY, 2, rowH)

      // Fine, slightly curved grain lines rather than repeated straight stripes.
      for (let i = 0; i < 62; i++) {
        const y = rowY + 4 + rand() * (rowH - 8)
        const alpha = 0.025 + rand() * 0.09
        g.strokeStyle = rand() > 0.45 ? `rgba(54,31,16,${alpha})` : `rgba(245,211,169,${alpha})`
        g.lineWidth = 0.35 + rand() * 1.1
        g.beginPath()
        g.moveTo(x + rand() * 12, y)
        const amp = 0.7 + rand() * 3.3
        for (let px = 0; px <= len; px += 24) {
          g.lineTo(x + px, y + Math.sin(px * (0.008 + rand() * 0.008) + i) * amp)
        }
        g.stroke()
      }

      // Occasional natural knots and fine growth rings.
      if (rand() > 0.56) {
        const kx = x + 18 + rand() * Math.max(24, len - 36)
        const ky = rowY + rowH * (0.2 + rand() * 0.6)
        g.fillStyle = 'rgba(48,29,17,0.23)'
        g.beginPath()
        g.ellipse(kx, ky, 7 + rand() * 13, 2 + rand() * 4, rand() * 0.2, 0, Math.PI * 2)
        g.fill()
        g.strokeStyle = 'rgba(225,184,134,0.16)'
        g.lineWidth = 1
        g.beginPath()
        g.ellipse(kx, ky, 11 + rand() * 8, 4 + rand() * 3, 0, 0, Math.PI * 2)
        g.stroke()
      }
      x += len
    }
    g.fillStyle = 'rgba(35,22,14,0.46)'
    g.fillRect(0, rowY, size, 2.5)
    g.fillStyle = 'rgba(255,226,185,0.09)'
    g.fillRect(0, rowY + 3, size, 1)
  }

  // Fine surface noise helps the floor catch light like sealed timber.
  for (let i = 0; i < 24000; i++) {
    const a = 0.018 + rand() * 0.045
    g.fillStyle = rand() > 0.5 ? `rgba(255,245,224,${a})` : `rgba(25,17,12,${a})`
    g.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1)
  }
  return finish(canvas, repeatX, repeatY)
}

export function createGroundTexture(repeat = 40) {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d') as CanvasRenderingContext2D
  g.fillStyle = '#4f6a2c'
  g.fillRect(0, 0, size, size)
  const rand = seeded(99)
  for (let i = 0; i < 9000; i++) {
    const hue = 70 + rand() * 40
    const light = 18 + rand() * 22
    g.fillStyle = `hsla(${hue}, ${35 + rand() * 30}%, ${light}%, ${0.3 + rand() * 0.5})`
    const s = 1 + rand() * 4
    g.fillRect(rand() * size, rand() * size, s, s * (1 + rand() * 3))
  }
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `hsla(35, 30%, ${30 + rand() * 15}%, 0.25)`
    g.beginPath()
    g.ellipse(rand() * size, rand() * size, 10 + rand() * 30, 6 + rand() * 18, rand() * 3, 0, Math.PI * 2)
    g.fill()
  }
  return finish(canvas, repeat, repeat)
}


export function createBarkTexture() {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d') as CanvasRenderingContext2D
  const rand = seeded(184)
  const base = g.createLinearGradient(0, 0, size, 0)
  base.addColorStop(0, '#3f2d20')
  base.addColorStop(0.2, '#76543a')
  base.addColorStop(0.46, '#4d3828')
  base.addColorStop(0.7, '#806044')
  base.addColorStop(1, '#38271d')
  g.fillStyle = base
  g.fillRect(0, 0, size, size)
  for (let i = 0; i < 180; i++) {
    const x = rand() * size
    const w = 1 + rand() * 7
    g.strokeStyle = `rgba(${rand() > 0.5 ? '25,16,10' : '190,150,105'},${0.08 + rand() * 0.2})`
    g.lineWidth = w
    g.beginPath()
    g.moveTo(x, 0)
    g.bezierCurveTo(x + (rand() - 0.5) * 25, 150, x + (rand() - 0.5) * 18, 360, x + (rand() - 0.5) * 12, size)
    g.stroke()
  }
  for (let i = 0; i < 75; i++) {
    const x = rand() * size
    const y = rand() * size
    g.fillStyle = `rgba(20,14,10,${0.08 + rand() * 0.14})`
    g.beginPath()
    g.ellipse(x, y, 2 + rand() * 8, 5 + rand() * 22, rand() * 0.25, 0, Math.PI * 2)
    g.fill()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1, 2)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

export function createFabricTexture(baseColor = '#6f6256') {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d') as CanvasRenderingContext2D
  g.fillStyle = baseColor
  g.fillRect(0, 0, size, size)
  const rand = seeded(Math.round(baseColor.length * 8191))
  for (let i = 0; i < 18000; i++) {
    const shade = rand() > 0.5 ? 255 : 0
    g.fillStyle = `rgba(${shade},${shade},${shade},${0.025 + rand() * 0.07})`
    const x = rand() * size
    const y = rand() * size
    g.fillRect(x, y, 1 + rand() * 2, 1)
  }
  g.strokeStyle = 'rgba(255,255,255,0.055)'
  g.lineWidth = 1
  for (let y = 0; y < size; y += 4) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(size, y + 1); g.stroke()
  }
  g.strokeStyle = 'rgba(0,0,0,0.05)'
  for (let x = 0; x < size; x += 4) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 1, size); g.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2, 2)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

export function createScreenTexture(kind: 'tv' | 'daw') {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 576
  const g = canvas.getContext('2d') as CanvasRenderingContext2D
  if (kind === 'tv') {
    const grad = g.createLinearGradient(0, 0, 1024, 576)
    grad.addColorStop(0, '#0b0f1a')
    grad.addColorStop(1, '#1b1208')
    g.fillStyle = grad
    g.fillRect(0, 0, 1024, 576)
    const glow = g.createRadialGradient(512, 288, 40, 512, 288, 520)
    glow.addColorStop(0, 'rgba(232, 178, 106, 0.28)')
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = glow
    g.fillRect(0, 0, 1024, 576)
    g.fillStyle = '#f4e3c6'
    g.textAlign = 'center'
    g.font = '900 88px Geist, Arial, sans-serif'
    g.fillText('MPD MUSIC STUDIO', 512, 246)
    g.font = '600 56px Geist, Arial, sans-serif'
    g.fillStyle = '#f1c77c'
    g.fillText('OFFICIAL STUDIO & MUSIC', 512, 338)
    g.font = 'bold 42px Geist, Arial, sans-serif'
    g.fillStyle = '#ffffff'
    g.fillText('LOTTO-AI1.TISTORY.COM', 512, 430)
    g.font = '28px Geist, Arial, sans-serif'
    g.fillStyle = 'rgba(244, 227, 198, 0.72)'
    g.fillText('CLICK TO VISIT MPD MUSIC STUDIO', 512, 500)
  } else {
    g.fillStyle = '#16181d'
    g.fillRect(0, 0, 1024, 576)
    g.fillStyle = '#23262d'
    g.fillRect(0, 0, 1024, 40)
    const colors = ['#e8b26a', '#5fb3d9', '#8bd17c', '#e27a6b', '#b48ce0', '#e0d46b']
    const rand = seeded(5)
    for (let t = 0; t < 12; t++) {
      const y = 50 + t * 42
      g.fillStyle = '#1d2026'
      g.fillRect(0, y, 1024, 38)
      g.fillStyle = '#2b2f37'
      g.fillRect(0, y, 140, 38)
      let x = 150 + rand() * 80
      while (x < 1000) {
        const w = 60 + rand() * 220
        g.fillStyle = colors[t % colors.length]
        g.globalAlpha = 0.75
        g.fillRect(x, y + 4, w, 30)
        g.globalAlpha = 1
        g.strokeStyle = 'rgba(0,0,0,0.45)'
        g.beginPath()
        for (let px = 0; px < w; px += 3) {
          const h = (Math.sin(px * 0.3 + t) * 0.5 + 0.5) * rand() * 12
          g.moveTo(x + px, y + 19 - h)
          g.lineTo(x + px, y + 19 + h)
        }
        g.stroke()
        x += w + 20 + rand() * 80
      }
    }
    g.fillStyle = '#ffffff'
    g.fillRect(560, 40, 2, 536)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createDrumHeadTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const g = canvas.getContext('2d') as CanvasRenderingContext2D
  g.fillStyle = '#f3efe6'
  g.fillRect(0, 0, 512, 512)
  g.fillStyle = '#1b1b1b'
  g.textAlign = 'center'
  g.font = 'bold 120px Geist, Arial, sans-serif'
  g.fillText('MPD', 256, 280)
  g.font = '600 38px Geist, Arial, sans-serif'
  g.fillStyle = '#b07a35'
  g.fillText('MUSIC', 256, 335)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
