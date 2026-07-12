import Foundation

/// Exponential moving average. Kills per-frame jitter so a momentary lean
/// doesn't register as a posture change — we sample slowly and smooth hard.
struct EMA {
  private let alpha: Double
  private(set) var value: Double?

  init(alpha: Double) {
    self.alpha = alpha
  }

  @discardableResult
  mutating func update(_ x: Double) -> Double {
    let next = value.map { $0 + alpha * (x - $0) } ?? x
    value = next
    return next
  }
}
