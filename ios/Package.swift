// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Claudit",
    platforms: [
        .iOS(.v17),
    ],
    products: [
        .library(name: "Claudit", targets: ["Claudit"]),
    ],
    dependencies: [
        .package(url: "https://github.com/daltoniam/Starscream.git", from: "4.0.6"),
    ],
    targets: [
        .target(
            name: "Claudit",
            dependencies: ["Starscream"],
            path: "Claudit"
        ),
    ]
)
