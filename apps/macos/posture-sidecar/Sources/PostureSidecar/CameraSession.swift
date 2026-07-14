import AVFoundation
import CoreMedia
import CoreVideo
import Foundation
import Vision

enum CameraError: Error {
  case noCamera
  case cannotConfigure
}

/// Owns the capture pipeline. Grabs frames, throttles to one Vision pass every
/// `sampleInterval` seconds, and hands the nearest face observation to a
/// callback. Frames are processed in RAM and discarded — nothing is stored.
final class CameraSession: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  private let session = AVCaptureSession()
  private let queue = DispatchQueue(label: "cuewise.posture.camera")
  private let sampleInterval: TimeInterval
  private var lastSampleAt: TimeInterval = 0
  private let onObservation: (VNFaceObservation?) -> Void

  init(sampleInterval: TimeInterval, onObservation: @escaping (VNFaceObservation?) -> Void) {
    self.sampleInterval = sampleInterval
    self.onObservation = onObservation
  }

  func start() throws {
    session.beginConfiguration()
    session.sessionPreset = .medium

    let device =
      AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front)
      ?? AVCaptureDevice.default(for: .video)
    guard let device else {
      throw CameraError.noCamera
    }

    let input = try AVCaptureDeviceInput(device: device)
    guard session.canAddInput(input) else {
      throw CameraError.cannotConfigure
    }
    session.addInput(input)

    let output = AVCaptureVideoDataOutput()
    output.alwaysDiscardsLateVideoFrames = true
    output.setSampleBufferDelegate(self, queue: queue)
    guard session.canAddOutput(output) else {
      throw CameraError.cannotConfigure
    }
    session.addOutput(output)

    session.commitConfiguration()
    session.startRunning()
  }

  func stop() {
    session.stopRunning()
  }

  /// Re-acquire the camera after a stop — the configured pipeline survives
  /// stopRunning, so no reconfiguration is needed (idempotent while running).
  func resume() {
    session.startRunning()
  }

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    // Throttle: mimic the real feature's slow cadence and cut jitter.
    let now = ProcessInfo.processInfo.systemUptime
    guard now - lastSampleAt >= sampleInterval else {
      return
    }
    lastSampleAt = now

    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      return
    }

    // Rectangles request is enough: it populates roll/yaw/pitch + bbox, and we
    // don't need landmark points. Orientation .up is a known tuning knob.
    let request = VNDetectFaceRectanglesRequest()
    let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .up, options: [:])
    do {
      try handler.perform([request])
      let faces = request.results ?? []
      let nearest = faces.max(by: { $0.boundingBox.height < $1.boundingBox.height })
      onObservation(nearest)
    } catch {
      onObservation(nil)
    }
  }
}
