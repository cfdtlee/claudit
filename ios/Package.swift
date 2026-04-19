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
        .package(url: "https://github.com/migueldeicaza/SwiftTerm.git", from: "1.13.0"),
    ],
    targets: [
        .target(
            name: "Claudit",
            dependencies: ["Starscream", "SwiftTerm"],
            path: "Claudit"
        ),
    ]
)
