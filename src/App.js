
import React, { useState, useRef, useEffect } from "react";
import * as tmImage from "@teachablemachine/image";

import Plastic from "./plastic";
import Paper from "./paper";
import Metal from "./metal";
import Glass from "./glass";
import Organic from "./organic";
import Cardboard from "./cardboard";

import "./App.css";

const MODEL_URL =
  "https://teachablemachine.withgoogle.com/models/PETbuu2BS/";

const disposalTips = {
  plastic: "Put clean, recyclable plastic in the dry-waste recycling bin.",
  paper: "Keep paper dry and place it in paper recycling.",
  metal: "Separate recyclable metal cans and containers.",
  glass: "Place glass in the designated glass recycling container.",
  organic: "Put food scraps and suitable organic waste in composting.",
  cardboard: "Keep cardboard dry, flatten it, and send it for recycling.",
};

const wasteComponents = {
  plastic: Plastic,
  paper: Paper,
  metal: Metal,
  glass: Glass,
  organic: Organic,
  cardboard: Cardboard,
};

function normalizeCategory(label) {
  const name = label.toLowerCase().trim();

  if (name.includes("cardboard")) return "cardboard";
  if (name.includes("plastic")) return "plastic";
  if (name.includes("paper")) return "paper";
  if (name.includes("metal")) return "metal";
  if (name.includes("glass")) return "glass";

  if (
    name.includes("organic") ||
    name.includes("food") ||
    name.includes("biodegradable")
  ) {
    return "organic";
  }

  return null;
}

export default function App() {
  const [selectedWaste, setSelectedWaste] = useState("plastic");
  const [model, setModel] = useState(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState("environment");
  const [error, setError] = useState("");

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const previewUrlRef = useRef("");

  // Load the Teachable Machine model.
  async function loadModel() {
    if (model) return model;

    const baseURL = MODEL_URL.endsWith("/")
      ? MODEL_URL
      : `${MODEL_URL}/`;

    const loadedModel = await tmImage.load(
      `${baseURL}model.json`,
      `${baseURL}metadata.json`
    );

    setModel(loadedModel);
    return loadedModel;
  }

  // Release the previous preview URL.
  function clearPreviewURL() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
    }
  }

  // Display a captured or uploaded image.
  function displayPreview(url) {
    clearPreviewURL();

    previewUrlRef.current = url;
    setPreview(url);
  }

  // Start the camera.
  async function startCamera() {
    setError("");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Camera requires localhost or HTTPS. Open your app using localhost."
        );
      }

      // Stop an existing stream before starting another.
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
        },
        audio: false,
      });

      streamRef.current = stream;

      // The video element is always rendered below.
      const video = videoRef.current;

      if (!video) {
        throw new Error("Camera video element was not found.");
      }

      video.srcObject = stream;
      await video.play();

      setCameraActive(true);
      setError("");
    } catch (err) {
      console.error("Camera start error:", err);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      setCameraActive(false);

      if (err.name === "NotAllowedError") {
        setError(
          "Camera permission denied. Allow camera access in Chrome site settings."
        );
      } else if (err.name === "NotFoundError") {
        setError("No camera was found on this device.");
      } else if (err.name === "NotReadableError") {
        setError(
          "Camera is being used by another app. Close other camera apps and try again."
        );
      } else {
        setError(err.message || "Unable to start camera.");
      }
    }
  }

  // Stop the camera and release its tracks.
  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
  }

  // Switch between front and rear cameras.
  async function switchCamera() {
    const nextMode =
      facingMode === "environment" ? "user" : "environment";

    setError("");

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextMode },
        },
        audio: false,
      });

      streamRef.current = stream;

      const video = videoRef.current;

      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        throw new Error("Camera video element was not found.");
      }

      video.srcObject = stream;
      await video.play();

      setFacingMode(nextMode);
      setCameraActive(true);
    } catch (err) {
      console.error("Switch camera error:", err);
      setError(err.message || "Could not switch cameras.");
      stopCamera();
    }
  }

  // Run AI classification on an image, canvas, or video frame.
  async function classifySource(imageSource) {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const currentModel = await loadModel();
      const predictions = await currentModel.predict(imageSource);

      if (!predictions || predictions.length === 0) {
        throw new Error("No predictions received from the AI model.");
      }

      const best = predictions.reduce((previous, current) =>
        current.probability > previous.probability ? current : previous
      );

      const category = normalizeCategory(best.className);

      if (category && wasteComponents[category]) {
        setSelectedWaste(category);
      }

      setResult({
        className: best.className,
        category,
        score: best.probability,
        predictions,
        tip:
          (category && disposalTips[category]) ||
          "This model class does not match the six supported categories. Check your model's class labels.",
      });
    } catch (err) {
      console.error("AI classification error:", err);
      setError(
        err.message || "AI could not classify the image. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // Capture a photo from the live camera and classify it.
  async function captureAndIdentify() {
    setError("");

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      setError("Camera or canvas element is missing.");
      return;
    }

    if (
      video.readyState < 2 ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      setError("Camera is not ready. Wait for the live video.");
      return;
    }

    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Could not access the photo canvas.");
      }

      context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (capturedBlob) => {
            if (capturedBlob) {
              resolve(capturedBlob);
            } else {
              reject(new Error("Photo capture failed."));
            }
          },
          "image/jpeg",
          0.95
        );
      });

      const imageURL = URL.createObjectURL(blob);
      displayPreview(imageURL);

      await classifySource(canvas);
    } catch (err) {
      console.error("Photo capture error:", err);
      setError(err.message || "Could not capture the photo.");
    }
  }

  // Upload and classify an image.
  async function classifyImage(event) {
    const file = event.target.files?.[0];

    // Allow the same file to be selected again.
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file.");
      return;
    }

    setError("");
    setResult(null);

    const imageURL = URL.createObjectURL(file);
    displayPreview(imageURL);

    const image = new Image();

    image.onload = async () => {
      await classifySource(image);
    };

    image.onerror = () => {
      setError("Could not load the selected image.");
    };

    image.src = imageURL;
  }

  function handleUpload() {
    fileInputRef.current?.click();
  }

  function selectCategory(category) {
    setSelectedWaste(category);
    setResult(null);
  }

  function clearResult() {
    setResult(null);
    setError("");
    setPreview("");
    clearPreviewURL();
  }

  // Release camera and preview resources when the component unmounts.
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const SelectedWaste = wasteComponents[selectedWaste];

  return (
    <main className="app">
      {/* NAVBAR */}
      <nav className="navbar">
        <a href="#home" className="brand">
          ♻ EcoSort AI
        </a>

        <span className="nav-label">SMART WASTE MANAGEMENT</span>
      </nav>

      {/* HERO AND SCANNER */}
      <section className="hero" id="home">
        <div className="hero-text">
          <span className="eyebrow">AI-POWERED RECYCLING</span>

          <h1>
            Waste less.
            <br />
            Recycle smarter.
          </h1>

          <p>
            Upload a waste image or use your camera to identify waste
            with artificial intelligence.
          </p>
        </div>

        <div className="scanner">
          <div className="scanner-icon">🌱</div>

          <h2>Smart Waste Scanner</h2>

          <p>Keep one waste item clearly in the camera frame.</p>

          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={classifyImage}
            style={{ display: "none" }}
          />

          <div className="scanner-actions">
            <button
              type="button"
              className="upload-btn"
              onClick={handleUpload}
              disabled={loading}
            >
              ＋ Upload Image
            </button>

            {!cameraActive ? (
              <button
                type="button"
                className="upload-btn"
                onClick={startCamera}
                disabled={loading}
              >
                📷 Open Camera
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="upload-btn"
                  onClick={switchCamera}
                  disabled={loading}
                >
                  🔄 Switch Camera
                </button>

                <button
                  type="button"
                  className="upload-btn"
                  onClick={captureAndIdentify}
                  disabled={loading}
                >
                  📸 Capture Photo
                </button>

                <button
                  type="button"
                  className="upload-btn"
                  onClick={stopCamera}
                  disabled={loading}
                >
                  ✖ Stop Camera
                </button>
              </>
            )}
          </div>

          {/* VIDEO ALWAYS EXISTS; HIDE IT WHEN CAMERA IS OFF */}
          <div
            className="preview-container"
            style={{ display: cameraActive ? "block" : "none" }}
          >
            <video
              ref={videoRef}
              className="preview"
              autoPlay
              playsInline
              muted
            />

            <p className="status">
              📷 Camera is active. Position your waste item.
            </p>
          </div>

          {/* HIDDEN CANVAS FOR CAPTURE */}
          <canvas ref={canvasRef} style={{ display: "none" }} />

          {/* CAPTURED OR UPLOADED PHOTO */}
          {preview && (
            <div className="preview-container">
              <h3>Captured / Uploaded Photo</h3>

              <img
                src={preview}
                alt="Waste item preview"
                className="preview"
              />
            </div>
          )}

          {loading && (
            <p className="status">🤖 AI is analyzing your image...</p>
          )}

          {error && <p className="error">❌ {error}</p>}

          {/* AI RESULTS */}
          {result && (
            <div className="result">
              <span className="eyebrow">AI CLASSIFICATION RESULT</span>

              <h2>{result.className.toUpperCase()}</h2>

              <p>
                Confidence: {(result.score * 100).toFixed(1)}%
              </p>

              <div className="confidence-track">
                <div
                  className="confidence-fill"
                  style={{ width: `${result.score * 100}%` }}
                />
              </div>

              <h3>♻ Disposal Suggestion</h3>
              <p>{result.tip}</p>

              <details>
                <summary>View all predictions</summary>

                {result.predictions.map((item) => (
                  <p key={item.className}>
                    {item.className}:{" "}
                    {(item.probability * 100).toFixed(1)}%
                  </p>
                ))}
              </details>
            </div>
          )}

          {(preview || result || error) && (
            <button
              type="button"
              className="upload-btn"
              onClick={clearResult}
              disabled={loading}
            >
              Clear Result
            </button>
          )}
        </div>
      </section>

      {/* HOW TO RECYCLE */}
      <section className="recycle-section">
        <h2>♻ How to Recycle</h2>
        <p>Select a category to learn more.</p>

        <div className="waste-menu">
          {Object.keys(wasteComponents).map((name) => (
            <button
              key={name}
              type="button"
              className={selectedWaste === name ? "active" : ""}
              onClick={() => selectCategory(name)}
            >
              {name.charAt(0).toUpperCase() + name.slice(1)}
            </button>
          ))}
        </div>

        <div className="selected-waste">
          {SelectedWaste ? <SelectedWaste /> : <p>Select a category.</p>}
        </div>
      </section>

      {/* SIX WASTE CLASSES */}
      <section className="categories">
        <span className="eyebrow">OUR CLASSIFICATION CLASSES</span>

        <h2>Give every waste item a second chance.</h2>

        <div className="category-grid">
          {[
            {
              name: "plastic",
              icon: "♻",
              description: "Recyclable plastics",
            },
            {
              name: "paper",
              icon: "📄",
              description: "Paper and sheets",
            },
            {
              name: "metal",
              icon: "🥫",
              description: "Cans and metal items",
            },
            {
              name: "glass",
              icon: "🍾",
              description: "Glass bottles and jars",
            },
            {
              name: "organic",
              icon: "🍃",
              description: "Food scraps and compost",
            },
            {
              name: "cardboard",
              icon: "📦",
              description: "Boxes and packaging",
            },
          ].map((item) => (
            <article
              key={item.name}
              className="category-card"
              role="button"
              tabIndex={0}
              onClick={() => selectCategory(item.name)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  selectCategory(item.name);
                }
              }}
            >
              <span>{item.icon}</span>

              <h3>
                {item.name.charAt(0).toUpperCase() +
                  item.name.slice(1)}
              </h3>

              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <footer>
        EcoSort AI · A smarter step towards a cleaner planet 🌍
      </footer>
    </main>
  );
}