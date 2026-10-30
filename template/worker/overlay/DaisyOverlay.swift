// {{ASSISTANT}} overlay: while a host-lane computer-use job works on {{OWNER}}'s Mac, a frosted cool-blue haze around the edges of
// each display {{ASSISTANT}} is acting on, and {{ASSISTANT}}'s own blue cursor that glides to each target and pulses on the action.
// It never moves {{OWNER}}'s pointer and never takes focus: every window is a click-through, non-activating panel at
// screen-saver level on all Spaces (full-screen ones too). It needs no macOS permission (no capture: the frost is the
// system's own behind-window blur).
//
// Driven by worker/host-lane.mjs over stdin, one JSON object per line; replies (one line each) carry the same "id".
//   {"cmd":"frost","rects":[[x,y,w,h],...]}   frost every display these rects touch, clear the rest ([] clears all)
//   {"cmd":"move","x":..,"y":..,"kind":"click"} glide the cursor there (kind: click|double|type|key|scroll|look|none),
//                                               reply on arrival, then pulse
//   {"cmd":"glide","x":..,"y":..,"ms":..}        glide over a set time, no pulse
//   {"cmd":"state"}                              frosted displays, cursor, {{OWNER}}'s pointer (for tests and the pointer guard)
//   {"cmd":"clear"} / {"cmd":"quit"}             fade everything out / fade out and exit
// Coordinates are global screen points, top-left origin of the main display (the space cua-driver uses).
// It clears and exits on stdin EOF (the lane is gone), when its parent dies, or when <job dir>/.stop appears.
// Usage: DaisyOverlay --job-dir <dir> [--band 120] [--motion glide|system]
//        DaisyOverlay --print-displays   the displays as JSON (global top-left points), then exit
//        Tests only: --click-target x y w h (a window that reports mouse-downs), --warp x y (put the pointer back)

import AppKit
import QuartzCore

let BLUE = NSColor(srgbRed: 0.30, green: 0.64, blue: 1.0, alpha: 1)       // cool frosted blue
let BLUE_DEEP = NSColor(srgbRed: 0.16, green: 0.45, blue: 0.98, alpha: 1)

var jobDir: String? = nil
var band: CGFloat = 120
var followSystemMotion = false // --motion system: honour macOS Reduce Motion (snap instead of glide); default glides, as {{OWNER}} asked
do {
  let a = CommandLine.arguments
  if let i = a.firstIndex(of: "--job-dir"), i + 1 < a.count { jobDir = a[i + 1] }
  if let i = a.firstIndex(of: "--band"), i + 1 < a.count, let b = Double(a[i + 1]) { band = CGFloat(b) }
  if let i = a.firstIndex(of: "--motion"), i + 1 < a.count { followSystemMotion = a[i + 1] == "system" }
}
func reduceMotion() -> Bool { followSystemMotion && NSWorkspace.shared.accessibilityDisplayShouldReduceMotion }

let iso = ISO8601DateFormatter()
iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
func log(_ s: String) {
  guard let d = jobDir else { return }
  let line = "\(iso.string(from: Date())) \(s)\n"
  let p = d + "/overlay.log"
  if let h = FileHandle(forWritingAtPath: p) { h.seekToEndOfFile(); h.write(line.data(using: .utf8)!); h.closeFile() }
  else { FileManager.default.createFile(atPath: p, contents: line.data(using: .utf8)) }
}
func reply(_ o: [String: Any]) {
  guard let d = try? JSONSerialization.data(withJSONObject: o), var s = String(data: d, encoding: .utf8) else { return }
  s += "\n"
  FileHandle.standardOutput.write(s.data(using: .utf8)!)
}

// ---- coordinates: global top-left points (cua-driver) <-> Cocoa bottom-left ----
func primaryHeight() -> CGFloat { NSScreen.screens.first?.frame.height ?? 0 }
func toCocoa(_ p: CGPoint) -> CGPoint { CGPoint(x: p.x, y: primaryHeight() - p.y) }
func toTopLeft(_ p: CGPoint) -> CGPoint { CGPoint(x: p.x, y: primaryHeight() - p.y) }
func topLeftRect(_ f: NSRect) -> CGRect { CGRect(x: f.minX, y: primaryHeight() - f.maxY, width: f.width, height: f.height) }
func displayID(_ s: NSScreen) -> UInt32 { (s.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value ?? 0 }
func rectArr(_ r: CGRect) -> [Double] { [Double(r.minX), Double(r.minY), Double(r.width), Double(r.height)] }

class Panel: NSPanel {
  override var canBecomeKey: Bool { false }
  override var canBecomeMain: Bool { false }
}
func makePanel(_ frame: NSRect) -> Panel {
  let p = Panel(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
  p.isOpaque = false
  p.backgroundColor = .clear
  p.hasShadow = false
  p.ignoresMouseEvents = true                      // clicks go straight through to whatever is underneath
  p.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.screenSaverWindow)))
  p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
  p.isReleasedWhenClosed = false
  p.hidesOnDeactivate = false
  p.becomesKeyOnlyIfNeeded = true
  p.animationBehavior = .none
  p.alphaValue = 0
  return p
}

// Soft inner band: strongest at the screen edge, fading smoothly to nothing about `band` points in. Drawn as an
// inner shadow (a frame just outside the screen casting a wide blur inward), so the falloff has no steps or seams.
func edgeImage(_ size: NSSize, _ band: CGFloat, _ color: NSColor) -> NSImage {
  NSImage(size: size, flipped: false) { r in
    guard let c = NSGraphicsContext.current?.cgContext else { return false }
    c.clip(to: r)
    let frame = CGMutablePath()
    frame.addRect(r.insetBy(dx: -band * 3, dy: -band * 3))
    frame.addRect(r.insetBy(dx: -2, dy: -2))
    for (blur, alpha) in [(band * 0.9, 1.0), (band * 0.3, 0.7)] as [(CGFloat, CGFloat)] {
      c.saveGState()
      c.setShadow(offset: .zero, blur: blur, color: color.withAlphaComponent(alpha).cgColor)
      c.addPath(frame)
      c.setFillColor(color.cgColor)
      c.fillPath(using: .evenOdd)
      c.restoreGState()
    }
    return true
  }
}

// ---- edge glow, one per display ----
class Glow {
  let id: UInt32
  let panel: Panel
  var on = false
  init(_ screen: NSScreen) {
    id = displayID(screen)
    panel = makePanel(screen.frame)
    panel.title = "{{ASSISTANT}} Glow \(id)"
    let root = NSView(frame: NSRect(origin: .zero, size: screen.frame.size))
    root.wantsLayer = true
    if NSWorkspace.shared.accessibilityDisplayShouldReduceTransparency {
      // With Reduce Transparency on, macOS draws blur as a solid panel; paint a milky frost instead so the edge stays light.
      let milk = NSImageView(frame: root.bounds)
      milk.image = edgeImage(root.bounds.size, band, NSColor(srgbRed: 0.86, green: 0.93, blue: 1, alpha: 0.42))
      milk.imageScaling = .scaleAxesIndependently
      milk.autoresizingMask = [.width, .height]
      root.addSubview(milk)
    } else {
      let frost = NSVisualEffectView(frame: root.bounds)
      frost.material = .hudWindow
      frost.blendingMode = .behindWindow
      frost.state = .active
      frost.appearance = NSAppearance(named: .vibrantLight)
      frost.maskImage = edgeImage(root.bounds.size, band, NSColor(white: 1, alpha: 0.9))
      frost.autoresizingMask = [.width, .height]
      root.addSubview(frost)
    }
    let tint = NSImageView(frame: root.bounds)
    tint.image = edgeImage(root.bounds.size, band * 0.85, BLUE.withAlphaComponent(0.68))
    tint.imageScaling = .scaleAxesIndependently
    tint.wantsLayer = true
    tint.autoresizingMask = [.width, .height]
    root.addSubview(tint)
    if !reduceMotion() {
      let b = CABasicAnimation(keyPath: "opacity")
      b.fromValue = 0.72; b.toValue = 1.0; b.duration = 2.2; b.autoreverses = true; b.repeatCount = .infinity
      b.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
      tint.layer?.add(b, forKey: "breathe")
    }
    panel.contentView = root
  }
  func set(_ want: Bool) {
    if want == on { return }
    on = want
    if want { panel.orderFrontRegardless() }
    NSAnimationContext.runAnimationGroup({ c in
      c.duration = want ? 0.55 : 0.8
      c.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
      panel.animator().alphaValue = want ? 1 : 0
    }, completionHandler: { [weak self] in
      if let s = self, !s.on { s.panel.orderOut(nil) }
    })
  }
}

// ---- {{ASSISTANT}}'s cursor ----
let CUR_W: CGFloat = 120, CUR_H: CGFloat = 64
let TIP = CGPoint(x: 14, y: CUR_H - 10) // the arrow tip inside the panel (Cocoa, bottom-left)

func arrowPath() -> CGPath {
  // A rounded arrow pointing up-left, tip at TIP, about 24 pt tall.
  let pts: [CGPoint] = [(0, 0), (0, -23), (6.2, -17.6), (10.4, -26.2), (14.6, -24.3), (10.6, -15.9), (18, -15.9)]
    .map { CGPoint(x: TIP.x + $0.0, y: TIP.y + $0.1) }
  let p = CGMutablePath()
  p.move(to: pts[0])
  for q in pts.dropFirst() { p.addLine(to: q) }
  p.closeSubpath()
  return p
}

class Cursor {
  let panel = makePanel(NSRect(x: 0, y: 0, width: CUR_W, height: CUR_H))
  let body = CALayer()
  var pos: CGPoint? = nil            // tip, global top-left
  var visible = false
  var anim: (from: CGPoint, to: CGPoint, ctrl: CGPoint, t0: CFTimeInterval, dur: CFTimeInterval, done: (() -> Void)?)? = nil
  var timer: Timer? = nil

  init() {
    panel.title = "{{ASSISTANT}} Cursor"
    let root = NSView(frame: NSRect(x: 0, y: 0, width: CUR_W, height: CUR_H))
    root.wantsLayer = true
    let path = arrowPath()
    // frosted glass inside the arrow
    let frost = NSVisualEffectView(frame: root.bounds)
    frost.material = .hudWindow; frost.blendingMode = .behindWindow; frost.state = .active
    frost.maskImage = NSImage(size: root.bounds.size, flipped: false) { _ in
      guard let c = NSGraphicsContext.current?.cgContext else { return false }
      c.addPath(path); c.setFillColor(NSColor.white.cgColor); c.fillPath(); return true
    }
    root.addSubview(frost)
    body.frame = root.bounds
    let fill = CAShapeLayer()
    fill.path = path
    fill.fillColor = BLUE.withAlphaComponent(0.72).cgColor
    fill.strokeColor = NSColor(white: 1, alpha: 0.95).cgColor
    fill.lineWidth = 1.6
    fill.lineJoin = .round
    fill.shadowColor = BLUE.cgColor; fill.shadowOpacity = 0.95; fill.shadowRadius = 7; fill.shadowOffset = .zero
    body.addSublayer(fill)
    // name tag
    let tag = CATextLayer()
    tag.string = "{{ASSISTANT}}"
    tag.font = NSFont.systemFont(ofSize: 11, weight: .semibold)
    tag.fontSize = 11
    tag.foregroundColor = NSColor.white.cgColor
    tag.alignmentMode = .center
    tag.contentsScale = 2
    tag.frame = CGRect(x: TIP.x + 17, y: TIP.y - 40, width: 44, height: 17)
    tag.backgroundColor = BLUE_DEEP.withAlphaComponent(0.85).cgColor
    tag.cornerRadius = 8.5
    tag.borderColor = NSColor(white: 1, alpha: 0.6).cgColor
    tag.borderWidth = 0.8
    body.addSublayer(tag)
    // scale around the tip for the press
    body.anchorPoint = CGPoint(x: TIP.x / CUR_W, y: TIP.y / CUR_H)
    body.position = TIP
    root.layer?.addSublayer(body)
    panel.contentView = root
  }

  func place(_ p: CGPoint) {
    pos = p
    let c = toCocoa(p)
    panel.setFrameOrigin(NSPoint(x: c.x - TIP.x, y: c.y - TIP.y))
  }

  func show() {
    if visible { return }
    visible = true
    panel.orderFrontRegardless()
    NSAnimationContext.runAnimationGroup { c in c.duration = 0.22; panel.animator().alphaValue = 1 }
  }

  func hide() {
    visible = false
    anim = nil
    NSAnimationContext.runAnimationGroup({ c in c.duration = 0.5; panel.animator().alphaValue = 0 },
      completionHandler: { [weak self] in if let s = self, !s.visible { s.panel.orderOut(nil) } })
  }

  // Eased glide along a gentle arc; the time grows with the distance (like a hand, not a teleport).
  func glide(to: CGPoint, ms: Double? = nil, done: (() -> Void)?) {
    let reduce = reduceMotion()
    let from: CGPoint
    if let p = pos, visible { from = p }
    else {
      // first appearance: start a little below-right of the target on the same display, then glide in
      from = CGPoint(x: to.x + 160, y: to.y + 110)
      place(from)
      show()
    }
    let dx = to.x - from.x, dy = to.y - from.y
    let dist = hypot(dx, dy)
    let dur = reduce ? 0.12 : (ms.map { $0 / 1000 } ?? min(0.95, max(0.30, 0.24 + Double(dist) / 2600)))
    let bend = min(80, dist * 0.12)
    let mid = CGPoint(x: (from.x + to.x) / 2, y: (from.y + to.y) / 2)
    let ctrl = dist > 1 ? CGPoint(x: mid.x - dy / dist * bend, y: mid.y + dx / dist * bend) : mid
    anim = (from, to, ctrl, CACurrentMediaTime(), dur, done)
    if timer == nil {
      let t = Timer(timeInterval: 1.0 / 120, repeats: true) { [weak self] _ in self?.step() }
      RunLoop.main.add(t, forMode: .common)
      timer = t
    }
  }

  func step() {
    guard let a = anim else { timer?.invalidate(); timer = nil; return }
    let u = min(1, (CACurrentMediaTime() - a.t0) / a.dur)
    // ease-in-out cubic with a soft landing
    let e = u < 0.5 ? 4 * u * u * u : 1 - pow(-2 * u + 2, 3) / 2
    let t = CGFloat(e), s = 1 - t
    let p = CGPoint(x: s * s * a.from.x + 2 * s * t * a.ctrl.x + t * t * a.to.x,
                    y: s * s * a.from.y + 2 * s * t * a.ctrl.y + t * t * a.to.y)
    place(p)
    if u >= 1 { anim = nil; a.done?() }
  }

  func press(double: Bool = false) {
    let k = CAKeyframeAnimation(keyPath: "transform.scale")
    k.values = double ? [1, 0.8, 1, 0.8, 1] : [1, 0.8, 1.04, 1]
    k.keyTimes = double ? [0, 0.2, 0.45, 0.7, 1] : [0, 0.3, 0.7, 1]
    k.duration = double ? 0.42 : 0.3
    body.add(k, forKey: "press")
  }
}

// A ring that spreads from the tip and fades: the "click" you can see.
func pulse(at p: CGPoint, kind: String) {
  let size: CGFloat = kind == "click" || kind == "double" ? 96 : 64
  let c = toCocoa(p)
  let panel = makePanel(NSRect(x: c.x - size / 2, y: c.y - size / 2, width: size, height: size))
  panel.title = "{{ASSISTANT}} Pulse"
  let v = NSView(frame: NSRect(x: 0, y: 0, width: size, height: size))
  v.wantsLayer = true
  panel.contentView = v
  panel.alphaValue = 1
  panel.orderFrontRegardless()
  let rings = kind == "double" ? 2 : 1
  for i in 0..<rings {
    let ring = CAShapeLayer()
    ring.path = CGPath(ellipseIn: CGRect(x: 0, y: 0, width: size, height: size).insetBy(dx: 4, dy: 4), transform: nil)
    ring.frame = v.bounds
    ring.fillColor = BLUE.withAlphaComponent(kind == "click" || kind == "double" ? 0.22 : 0.14).cgColor
    ring.strokeColor = BLUE.withAlphaComponent(0.95).cgColor
    ring.lineWidth = 2.2
    ring.opacity = 0
    v.layer?.addSublayer(ring)
    let g = CAAnimationGroup()
    let sc = CABasicAnimation(keyPath: "transform.scale"); sc.fromValue = 0.18; sc.toValue = 1
    let op = CABasicAnimation(keyPath: "opacity"); op.fromValue = 0.95; op.toValue = 0
    g.animations = [sc, op]
    g.duration = 0.5
    g.beginTime = CACurrentMediaTime() + Double(i) * 0.16
    g.timingFunction = CAMediaTimingFunction(name: .easeOut)
    g.fillMode = .both
    ring.add(g, forKey: "pulse")
  }
  DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { panel.orderOut(nil); panel.close() }
}

// ---- the app ----
class Overlay: NSObject, NSApplicationDelegate {
  var glows: [UInt32: Glow] = [:]
  var frosted: Set<UInt32> = []
  let cursor = Cursor()
  var ending = false

  func applicationDidFinishLaunching(_ n: Notification) {
    rebuild()
    NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in self?.rebuild() }
    if let d = jobDir { try? "\(getpid())\n".write(toFile: d + "/.overlay.pid", atomically: true, encoding: .utf8) }
    log("overlay up (pid \(getpid())); displays: " + NSScreen.screens.map { "\(displayID($0)) \(rectArr(topLeftRect($0.frame)))" }.joined(separator: ", "))
    let parent = getppid()
    let watch = Timer(timeInterval: 0.4, repeats: true) { [weak self] _ in
      guard let s = self else { return }
      if getppid() != parent { s.finish("parent gone") }
      else if let d = jobDir, FileManager.default.fileExists(atPath: d + "/.stop") { s.finish("job stopped") }
    }
    RunLoop.main.add(watch, forMode: .common)
    readStdin()
  }

  func rebuild() {
    let want = Set(NSScreen.screens.map(displayID))
    for (id, g) in glows where !want.contains(id) { g.panel.orderOut(nil); glows[id] = nil; frosted.remove(id) }
    for s in NSScreen.screens {
      let id = displayID(s)
      if let g = glows[id], g.panel.frame == s.frame { continue }
      glows[id]?.panel.orderOut(nil)
      let g = Glow(s)
      glows[id] = g
      if frosted.contains(id) { g.set(true) }
    }
  }

  func frost(_ rects: [CGRect]) {
    var want: Set<UInt32> = []
    for s in NSScreen.screens {
      let f = topLeftRect(s.frame)
      if rects.contains(where: { $0.intersects(f) || f.contains(CGPoint(x: $0.midX, y: $0.midY)) }) { want.insert(displayID(s)) }
    }
    if want == frosted { return }
    frosted = want
    for (id, g) in glows { g.set(want.contains(id)) }
    log("frost " + (want.isEmpty ? "none" : want.sorted().map { String($0) }.joined(separator: ",")))
    writeState()
  }

  func state() -> [String: Any] {
    let mouse = toTopLeft(NSEvent.mouseLocation)
    return [
      "frosted": NSScreen.screens.filter { frosted.contains(displayID($0)) }.map { ["id": displayID($0), "frame": rectArr(topLeftRect($0.frame))] },
      "displays": NSScreen.screens.map { ["id": displayID($0), "frame": rectArr(topLeftRect($0.frame)), "main": $0 == NSScreen.screens.first] as [String: Any] },
      "cursor": ["visible": cursor.visible, "x": Double(cursor.pos?.x ?? 0), "y": Double(cursor.pos?.y ?? 0)],
      "pointer": ["x": Double(mouse.x), "y": Double(mouse.y)],
      "glowWindows": glows.values.filter { $0.panel.isVisible }.map { ["id": $0.id, "alpha": Double($0.panel.alphaValue), "ignoresMouse": $0.panel.ignoresMouseEvents, "level": $0.panel.level.rawValue] as [String: Any] },
      "hits": hits(),
      "at": iso.string(from: Date()),
    ]
  }

  // WindowServer's answer to "which window would a mouse-down here hit?" at points inside each frosted edge band:
  // never one of {{ASSISTANT}}'s (they ignore the mouse), so {{OWNER}}'s clicks land on what is underneath.
  func hits() -> [[String: Any]] {
    let ours = Set(glows.values.map { $0.panel.windowNumber } + [cursor.panel.windowNumber])
    var out: [[String: Any]] = []
    for s in NSScreen.screens where frosted.contains(displayID(s)) {
      let f = s.frame
      for p in [NSPoint(x: f.minX + 12, y: f.midY), NSPoint(x: f.maxX - 12, y: f.midY), NSPoint(x: f.midX, y: f.minY + 12), NSPoint(x: f.midX, y: f.maxY - 40)] {
        let n = NSWindow.windowNumber(at: p, belowWindowWithWindowNumber: 0)
        out.append(["display": displayID(s), "at": [Double(p.x), Double(toTopLeft(p).y)], "window": n, "daisy": ours.contains(n)])
      }
    }
    return out
  }

  func writeState() {
    guard let d = jobDir, let data = try? JSONSerialization.data(withJSONObject: state()) else { return }
    try? data.write(to: URL(fileURLWithPath: d + "/.overlay-state.json"))
  }

  func clear() {
    frost([])
    if cursor.visible { cursor.hide(); log("cursor hidden") }
    writeState()
  }

  func finish(_ why: String) {
    if ending { return }
    ending = true
    log("clearing and exiting: \(why)")
    clear()
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
      if let d = jobDir { try? FileManager.default.removeItem(atPath: d + "/.overlay.pid") }
      exit(0)
    }
  }

  func handle(_ line: String) {
    guard let data = line.data(using: .utf8), let m = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], let cmd = m["cmd"] as? String else { return }
    let id = m["id"] ?? NSNull()
    if ending { reply(["id": id, "ok": false, "why": "ending"]); return }
    switch cmd {
    case "frost":
      let rects = (m["rects"] as? [[Double]] ?? []).filter { $0.count == 4 }.map { CGRect(x: $0[0], y: $0[1], width: max(1, $0[2]), height: max(1, $0[3])) }
      frost(rects)
      reply(["id": id, "ok": true, "frosted": Array(frosted)])
    case "move", "glide":
      guard let x = m["x"] as? Double, let y = m["y"] as? Double else { reply(["id": id, "ok": false]); return }
      let kind = m["kind"] as? String ?? "none"
      let to = CGPoint(x: x, y: y)
      let t0 = Date()
      cursor.glide(to: to, ms: m["ms"] as? Double) { [weak self] in
        guard let s = self else { return }
        let ms = Int(Date().timeIntervalSince(t0) * 1000)
        if cmd == "move", kind != "none" {
          if kind == "click" || kind == "double" { s.cursor.press(double: kind == "double") }
          pulse(at: to, kind: kind)
        }
        log("cursor \(cmd) to \(Int(x)),\(Int(y)) in \(ms) ms\(kind != "none" ? ", \(kind) pulse" : "")")
        s.writeState()
        reply(["id": id, "ok": true, "ms": ms])
      }
    case "state":
      reply(["id": id, "ok": true, "state": state()])
    case "clear":
      clear()
      reply(["id": id, "ok": true])
    case "quit":
      reply(["id": id, "ok": true])
      finish("asked to quit")
    default:
      reply(["id": id, "ok": false, "why": "unknown cmd"])
    }
  }

  func readStdin() {
    var buf = Data()
    FileHandle.standardInput.readabilityHandler = { [weak self] h in
      let d = h.availableData
      if d.isEmpty {
        h.readabilityHandler = nil
        DispatchQueue.main.async { self?.finish("lane closed") }
        return
      }
      buf.append(d)
      while let i = buf.firstIndex(of: 0x0A) {
        let line = String(data: buf[buf.startIndex..<i], encoding: .utf8) ?? ""
        buf.removeSubrange(buf.startIndex...i)
        DispatchQueue.main.async { self?.handle(line) }
      }
    }
  }
}

signal(SIGPIPE, SIG_IGN)
if let i = CommandLine.arguments.firstIndex(of: "--warp"), i + 2 < CommandLine.arguments.count,
   let x = Double(CommandLine.arguments[i + 1]), let y = Double(CommandLine.arguments[i + 2]) {
  // Tests only: put {{OWNER}}'s pointer back where it was after the click-through test (global top-left points).
  CGWarpMouseCursorPosition(CGPoint(x: x, y: y))
  CGAssociateMouseAndMouseCursorPosition(1)
  exit(0)
}
if CommandLine.arguments.contains("--print-displays") {
  // One-shot for the host lane's list_displays: no windows, no overlay.
  let d = NSScreen.screens.enumerated().map { (i, s) in ["index": i + 1, "id": displayID(s), "frame": rectArr(topLeftRect(s.frame)), "main": i == 0, "name": s.localizedName] as [String: Any] }
  reply(["displays": d])
  exit(0)
}
let app = NSApplication.shared
app.setActivationPolicy(.accessory) // no Dock icon, never the frontmost app

// Tests only: --click-target x y w h shows a plain window at that rect (global top-left points) and prints
// {"clicked":[x,y]} for each mouse-down it receives, to prove {{OWNER}}'s real clicks pass through the glow.
class ClickView: NSView {
  override func acceptsFirstMouse(for e: NSEvent?) -> Bool { true }
  override func draw(_ r: NSRect) { NSColor.systemOrange.setFill(); r.fill() }
  override func mouseDown(with e: NSEvent) { let p = toTopLeft(NSEvent.mouseLocation); reply(["clicked": [Double(p.x), Double(p.y)]]) }
}
if let i = CommandLine.arguments.firstIndex(of: "--click-target"), i + 4 < CommandLine.arguments.count {
  let v = CommandLine.arguments[(i + 1)...(i + 4)].compactMap { Double($0) }
  let r = CGRect(x: v[0], y: v[1], width: v[2], height: v[3])
  let w = NSWindow(contentRect: NSRect(x: r.minX, y: primaryHeight() - r.maxY, width: r.width, height: r.height), styleMask: [.borderless], backing: .buffered, defer: false)
  w.contentView = ClickView(frame: NSRect(origin: .zero, size: r.size))
  w.level = .floating
  w.orderFrontRegardless()
  reply(["ready": true, "window": w.windowNumber])
  DispatchQueue.main.asyncAfter(deadline: .now() + 30) { exit(0) }
  app.run()
}
let delegate = Overlay()
app.delegate = delegate
signal(SIGTERM, SIG_IGN)
let term = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
term.setEventHandler { delegate.finish("SIGTERM") }
term.resume()
app.run()
