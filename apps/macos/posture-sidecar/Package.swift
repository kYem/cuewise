// swift-tools-version: 5.9
import PackageDescription

// Posture sidecar for the Cuewise macOS app. PostureKit holds the reusable Vision
// analysis (graduated from the POC); PostureSidecar is a headless executable that
// streams PostureSample JSON over stdio for the Tauri app to consume.
let package = Package(
  name: "posture-sidecar",
  platforms: [.macOS(.v13)],
  targets: [
    .target(name: "PostureKit"),
    .executableTarget(
      name: "PostureSidecar",
      dependencies: ["PostureKit"]
    ),
  ]
)
