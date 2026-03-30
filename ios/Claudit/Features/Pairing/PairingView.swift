import SwiftUI
#if os(iOS)
import AVFoundation
#endif

struct PairingView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel = PairingViewModel()
    @State private var scannedCode: String?
    @State private var showSuccess = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                Spacer()

                // Logo / Title
                VStack(spacing: 12) {
                    Image(systemName: "antenna.radiowaves.left.and.right")
                        .font(.system(size: 60))
                        .foregroundStyle(.accentBlue)

                    Text("Claudit")
                        .font(.largeTitle.bold())
                        .foregroundStyle(.textPrimary)

                    Text("Connect to your claudit server")
                        .font(.subheadline)
                        .foregroundStyle(.textSecondary)
                }

                if showSuccess {
                    successView
                } else if viewModel.showManualEntry {
                    manualEntryView
                } else {
                    qrScanView
                }

                Spacer()
            }
            .padding()
            .background(Color.bgPrimary)
            .onAppear {
                viewModel.checkCameraPermission()
            }
        }
    }

    // MARK: - QR Scan View

    private var qrScanView: some View {
        VStack(spacing: 24) {
            #if os(iOS)
            if viewModel.cameraPermissionGranted {
                QRScannerView { code in
                    handleScannedCode(code)
                }
                .frame(width: 280, height: 280)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color.borderColor, lineWidth: 2)
                )

                Text("Scan the QR code from your claudit server")
                    .font(.caption)
                    .foregroundStyle(.textSecondary)
                    .multilineTextAlignment(.center)
            } else {
                VStack(spacing: 16) {
                    Image(systemName: "camera.fill")
                        .font(.system(size: 40))
                        .foregroundStyle(.textSecondary)

                    Text("Camera access required to scan QR code")
                        .font(.subheadline)
                        .foregroundStyle(.textSecondary)
                        .multilineTextAlignment(.center)

                    Button("Open Settings") {
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            UIApplication.shared.open(url)
                        }
                    }
                    .buttonStyle(.bordered)
                }
                .padding(40)
            }
            #else
            Text("QR scanning is only available on iOS")
                .foregroundStyle(.textSecondary)
                .padding(40)
            #endif

            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.statusError)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            Button("Enter manually instead") {
                viewModel.showManualEntry = true
            }
            .font(.subheadline)
            .foregroundStyle(.accentBlue)
        }
    }

    // MARK: - Manual Entry

    private var manualEntryView: some View {
        VStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Relay URL")
                    .font(.caption)
                    .foregroundStyle(.textSecondary)
                TextField("https://relay.example.com", text: $viewModel.manualURL)
                    .textFieldStyle(.roundedBorder)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Pairing ID")
                    .font(.caption)
                    .foregroundStyle(.textSecondary)
                TextField("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", text: $viewModel.manualPairingId)
                    .textFieldStyle(.roundedBorder)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Encryption Key (base64url)")
                    .font(.caption)
                    .foregroundStyle(.textSecondary)
                TextField("Base64url-encoded 32-byte key", text: $viewModel.manualKey)
                    .textFieldStyle(.roundedBorder)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }

            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.statusError)
            }

            Button(action: handleManualEntry) {
                HStack {
                    if viewModel.isProcessing {
                        ProgressView()
                            .tint(.white)
                    }
                    Text("Connect")
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .tint(.accentBlue)
            .disabled(viewModel.isProcessing)

            Button("Scan QR code instead") {
                viewModel.showManualEntry = false
                viewModel.errorMessage = nil
            }
            .font(.subheadline)
            .foregroundStyle(.accentBlue)
        }
        .padding(.horizontal)
    }

    // MARK: - Success View

    private var successView: some View {
        VStack(spacing: 20) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(.statusSuccess)

            Text("Connected!")
                .font(.title2.bold())
                .foregroundStyle(.textPrimary)

            Text("Your device is paired with the claudit server")
                .font(.subheadline)
                .foregroundStyle(.textSecondary)
                .multilineTextAlignment(.center)
        }
        .transition(.scale.combined(with: .opacity))
    }

    // MARK: - Actions

    private func handleScannedCode(_ code: String) {
        guard scannedCode == nil else { return } // Prevent double-scan
        scannedCode = code

        guard let info = viewModel.parsePairingURL(code) else {
            scannedCode = nil
            return
        }

        completePairing(info)
    }

    private func handleManualEntry() {
        guard let info = viewModel.validateManualEntry() else { return }
        completePairing(info)
    }

    private func completePairing(_ info: PairingInfo) {
        viewModel.isProcessing = true
        viewModel.errorMessage = nil

        withAnimation {
            showSuccess = true
        }

        // Trigger haptic
        #if os(iOS)
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)
        #endif

        // Slight delay before transitioning
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            appState.pair(url: info.relayURL, pairingId: info.pairingId, secretKey: info.secretKey)
        }
    }
}

// MARK: - QR Scanner (AVFoundation)

#if os(iOS)
struct QRScannerView: UIViewRepresentable {
    let onCodeScanned: (String) -> Void

    func makeUIView(context: Context) -> QRScannerUIView {
        let view = QRScannerUIView()
        view.onCodeScanned = onCodeScanned
        return view
    }

    func updateUIView(_ uiView: QRScannerUIView, context: Context) {}
}

class QRScannerUIView: UIView, AVCaptureMetadataOutputObjectsDelegate {
    var onCodeScanned: ((String) -> Void)?
    private var captureSession: AVCaptureSession?

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupCamera()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupCamera()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if let previewLayer = layer.sublayers?.first as? AVCaptureVideoPreviewLayer {
            previewLayer.frame = bounds
        }
    }

    private func setupCamera() {
        let session = AVCaptureSession()

        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device) else { return }

        if session.canAddInput(input) {
            session.addInput(input)
        }

        let output = AVCaptureMetadataOutput()
        if session.canAddOutput(output) {
            session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            output.metadataObjectTypes = [.qr]
        }

        let previewLayer = AVCaptureVideoPreviewLayer(session: session)
        previewLayer.videoGravity = .resizeAspectFill
        previewLayer.frame = bounds
        layer.addSublayer(previewLayer)

        captureSession = session

        DispatchQueue.global(qos: .userInitiated).async {
            session.startRunning()
        }
    }

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              object.type == .qr,
              let code = object.stringValue
        else { return }

        captureSession?.stopRunning()
        onCodeScanned?(code)
    }
}
#endif
