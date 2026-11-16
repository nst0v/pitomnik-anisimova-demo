// A modal dialog makes elements outside it inert, so the fallback must live inside it.
export async function copyText(text: string, container: HTMLElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const previousFocus = document.activeElement
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.readOnly = true
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    container.append(textarea)
    try {
      textarea.focus({ preventScroll: true })
      textarea.select()
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      textarea.remove()
      if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true })
    }
  }
}
