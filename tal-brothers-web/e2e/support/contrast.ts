import type { Page } from '@playwright/test'

/**
 * 버튼 글자 대비 검사 (m4-plan 11.3 M4-C).
 *
 * shadcn 토큰은 `oklch()`로 적혀 있어 계산 스타일 문자열을 바로 숫자로 읽을 수 없다.
 * 캔버스에 칠해서 sRGB로 바꾼 뒤 WCAG 상대 휘도로 대비비를 구한다.
 * 배경은 투명한 조상을 거슬러 올라가며 겹쳐 칠한 결과를 쓴다.
 */

export type ContrastIssue = {
  text: string
  ratio: number
  foreground: string
  background: string
}

/** 보이는 활성 버튼 중 대비비가 `minimum`보다 낮은 것 */
export async function lowContrastButtons(page: Page, minimum = 4.5): Promise<ContrastIssue[]> {
  return page.evaluate((min) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (context === null) return []

    type Rgba = [number, number, number, number]

    const toRgba = (color: string): Rgba => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = '#000'
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data
      return [r, g, b, a / 255]
    }

    const over = (top: Rgba, bottom: Rgba): Rgba => {
      const alpha = top[3] + bottom[3] * (1 - top[3])
      if (alpha === 0) return [0, 0, 0, 0]
      const mix = (index: 0 | 1 | 2): number =>
        (top[index] * top[3] + bottom[index] * bottom[3] * (1 - top[3])) / alpha
      return [mix(0), mix(1), mix(2), alpha]
    }

    const backgroundOf = (element: Element): Rgba => {
      const layers: Rgba[] = []
      let node: Element | null = element
      while (node !== null) {
        const style = getComputedStyle(node)
        const color = toRgba(style.backgroundColor)
        if (color[3] > 0) layers.push(color)
        if (color[3] >= 1) break
        node = node.parentElement
      }
      // 아무 배경도 없으면 브라우저 기본 흰색이다
      let result: Rgba = [255, 255, 255, 1]
      for (const layer of layers.reverse()) result = over(layer, result)
      return result
    }

    const luminance = ([r, g, b]: Rgba): number => {
      const channel = (value: number): number => {
        const v = value / 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }

    const issues: { text: string; ratio: number; foreground: string; background: string }[] = []
    for (const button of document.querySelectorAll('button')) {
      if (button.disabled) continue
      const box = button.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) continue
      const text = (button.textContent ?? '').trim()
      if (text === '') continue

      const background = backgroundOf(button)
      const foreground = over(toRgba(getComputedStyle(button).color), background)
      const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [number, number]
      const ratio = (light + 0.05) / (dark + 0.05)
      if (ratio < min) {
        issues.push({
          text: text.slice(0, 40),
          ratio: Math.round(ratio * 100) / 100,
          foreground: `rgb(${foreground.slice(0, 3).map(Math.round).join(',')})`,
          background: `rgb(${background.slice(0, 3).map(Math.round).join(',')})`,
        })
      }
    }
    return issues
  }, minimum)
}
