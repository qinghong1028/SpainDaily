#!/usr/bin/env swift

import AppKit
import Foundation
import Vision

struct TextObservation: Codable {
    let text: String
    let confidence: Float
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct ImageResult: Codable {
    let path: String
    let width: Int
    let height: Int
    let observations: [TextObservation]
    let error: String?
}

func recognize(path: String) -> ImageResult {
    let url = URL(fileURLWithPath: path)
    guard let image = NSImage(contentsOf: url) else {
        return ImageResult(path: path, width: 0, height: 0, observations: [], error: "Unable to open image")
    }
    var rect = CGRect(origin: .zero, size: image.size)
    guard let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
        return ImageResult(path: path, width: 0, height: 0, observations: [], error: "Unable to create CGImage")
    }

    var observations: [TextObservation] = []
    var requestError: String?
    let request = VNRecognizeTextRequest { request, error in
        if let error {
            requestError = error.localizedDescription
            return
        }
        for item in request.results as? [VNRecognizedTextObservation] ?? [] {
            guard let candidate = item.topCandidates(1).first else { continue }
            let box = item.boundingBox
            observations.append(
                TextObservation(
                    text: candidate.string,
                    confidence: candidate.confidence,
                    x: box.origin.x,
                    y: box.origin.y,
                    width: box.size.width,
                    height: box.size.height
                )
            )
        }
    }
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["zh-Hans", "es-ES", "en-US"]

    do {
        try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
    } catch {
        requestError = error.localizedDescription
    }

    return ImageResult(
        path: path,
        width: cgImage.width,
        height: cgImage.height,
        observations: observations,
        error: requestError
    )
}

let arguments = Array(CommandLine.arguments.dropFirst())
guard arguments.count >= 2 else {
    FileHandle.standardError.write(Data("Usage: ocr_images.swift OUTPUT.json IMAGE...\n".utf8))
    exit(2)
}

let outputPath = arguments[0]
let imagePaths = Array(arguments.dropFirst())
let results = imagePaths.sorted().map(recognize)
let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]

do {
    let data = try encoder.encode(results)
    try data.write(to: URL(fileURLWithPath: outputPath), options: .atomic)
    let successes = results.filter { $0.error == nil }.count
    print("OCR completed: \(successes)/\(results.count) images")
} catch {
    FileHandle.standardError.write(Data("Failed to write OCR output: \(error)\n".utf8))
    exit(1)
}
