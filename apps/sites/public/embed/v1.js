/* Tradies chat widget v1 — self-contained, injected via
   <script src="/embed/v1.js" data-site-id="..." data-demo="true|false" defer>.
   Same-origin POST /api/chat; no external requests, no cookies. */
;(function () {
  var script = document.currentScript
  if (!script) return
  var siteId = script.getAttribute('data-site-id')
  if (!siteId) return
  var demo = script.getAttribute('data-demo') === 'true'
  var sessionId = 'cs-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  var messages = []
  var open = false

  var css =
    '.tpc-btn{position:fixed;right:20px;bottom:20px;z-index:99990;width:56px;height:56px;border-radius:50%;border:none;background:#1c3d5a;color:#fff;font-size:24px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)}' +
    '.tpc-panel{position:fixed;right:20px;bottom:88px;z-index:99991;width:min(360px,calc(100vw - 40px));height:480px;background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.28);display:flex;flex-direction:column;overflow:hidden;font-family:system-ui,sans-serif}' +
    '.tpc-head{background:#1c3d5a;color:#fff;padding:12px 16px;font-size:14px;font-weight:600}' +
    '.tpc-demo{display:inline-block;margin-left:8px;padding:1px 6px;border-radius:4px;background:#e8a13a;color:#1d2025;font-size:11px;font-weight:700;text-transform:uppercase}' +
    '.tpc-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f4f6f8}' +
    '.tpc-m{max-width:85%;padding:8px 12px;border-radius:10px;font-size:13.5px;line-height:1.45;white-space:pre-wrap}' +
    '.tpc-m.u{align-self:flex-end;background:#1c3d5a;color:#fff}' +
    '.tpc-m.a{align-self:flex-start;background:#fff;border:1px solid #dde3e8;color:#1d2025}' +
    '.tpc-form{display:flex;border-top:1px solid #e3e7ea}' +
    '.tpc-in{flex:1;border:none;padding:12px;font-size:13.5px;outline:none}' +
    '.tpc-send{border:none;background:#1c3d5a;color:#fff;padding:0 16px;font-size:13px;cursor:pointer}'
  var style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)

  var btn = document.createElement('button')
  btn.className = 'tpc-btn'
  btn.setAttribute('aria-label', 'Chat with us')
  btn.textContent = '💬'
  document.body.appendChild(btn)

  var panel = null

  function render() {
    if (!panel) return
    var box = panel.querySelector('.tpc-msgs')
    box.innerHTML = ''
    messages.forEach(function (m) {
      var el = document.createElement('div')
      el.className = 'tpc-m ' + (m.role === 'user' ? 'u' : 'a')
      el.textContent = m.content
      box.appendChild(el)
    })
    box.scrollTop = box.scrollHeight
  }

  function greet() {
    if (messages.length === 0) {
      messages.push({
        role: 'assistant',
        content:
          (demo ? '[Demo] ' : '') +
          'Hi! Ask me anything about our services, or leave your name and number and we will call you back.',
      })
    }
  }

  function togglePanel() {
    open = !open
    if (open && !panel) {
      panel = document.createElement('div')
      panel.className = 'tpc-panel'
      panel.innerHTML =
        '<div class="tpc-head">Chat with us' +
        (demo ? '<span class="tpc-demo">demo</span>' : '') +
        '</div><div class="tpc-msgs"></div>' +
        '<form class="tpc-form"><input class="tpc-in" placeholder="Type a message…" maxlength="500"/><button class="tpc-send" type="submit">Send</button></form>'
      document.body.appendChild(panel)
      panel.querySelector('form').addEventListener('submit', onSend)
      greet()
      render()
    } else if (panel) {
      panel.style.display = open ? 'flex' : 'none'
    }
  }

  function onSend(e) {
    e.preventDefault()
    var input = panel.querySelector('.tpc-in')
    var text = input.value.trim()
    if (!text) return
    input.value = ''
    messages.push({ role: 'user', content: text })
    render()
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId: siteId, sessionId: sessionId, messages: messages }),
    })
      .then(function (res) {
        if (res.status === 429)
          return { reply: 'We are getting a lot of messages — please try again in a few minutes.' }
        return res.json()
      })
      .then(function (data) {
        messages.push({ role: 'assistant', content: data.reply || 'Sorry — please try again.' })
        render()
      })
      .catch(function () {
        messages.push({ role: 'assistant', content: 'Sorry — something went wrong. Please call us instead.' })
        render()
      })
  }

  btn.addEventListener('click', togglePanel)
})()
