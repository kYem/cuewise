import Foundation

/// Coarse posture rollup. A real feature would drive nudges/Insights off this.
public enum PostureStatus: String, Codable {
  case good
  case mild
  case poor
  case absent
}

/// One derived posture reading — **never** an image. Only numbers.
///
/// This is the integration contract: when the POC graduates, this same shape
/// becomes a `PostureSample` interface in `@cuewise/shared` and gets persisted
/// into Cuewise storage for Insights to read. Keeping it as a plain Codable
/// struct now means that later step is a copy, not a redesign.
public struct PostureSample: Codable, Equatable {
  public let id: String
  public let timestamp: String  // ISO-8601
  public let status: PostureStatus
  public let present: Bool  // Was a face detected this tick?
  public let screenDistanceRatio: Double?  // Face height / frame height; larger = closer
  public let neckDeviation: Double?  // Signed deviation of the tech-neck metric from baseline (0 = baseline)
  public let headTiltDegrees: Double?  // Head roll; chronic lean

  public init(
    id: String,
    timestamp: String,
    status: PostureStatus,
    present: Bool,
    screenDistanceRatio: Double?,
    neckDeviation: Double?,
    headTiltDegrees: Double?
  ) {
    self.id = id
    self.timestamp = timestamp
    self.status = status
    self.present = present
    self.screenDistanceRatio = screenDistanceRatio
    self.neckDeviation = neckDeviation
    self.headTiltDegrees = headTiltDegrees
  }
}
