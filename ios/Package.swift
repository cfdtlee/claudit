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
    targets: [
        .target(
            name: "Claudit",
            path: "Claudit"
        ),
    ]
)
