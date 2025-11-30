const { useEffect, useState, useRef } = React;

const App = () => {
  const [folderPath, setFolderPath] = useState("");
  const [status, setStatus] = useState("");
  const [validation, setValidation] = useState({
    valid: false,
    checking: false,
    error: ""
  });
  const validateTimer = useRef(null);

  useEffect(() => {
    const loadSavedFolder = async () => {
      try {
        const saved = await window.api.getSavedFolder();
        if (saved) {
          setFolderPath(saved);
          setStatus("Saved folder loaded");
          runValidate(saved);
        } else {
          setStatus("No folder selected yet");
          setValidation({ valid: false, checking: false, error: "" });
        }
      } catch (e) {
        setStatus("Error loading saved folder");
      }
    };

    loadSavedFolder();
  }, []);

  const runValidate = async (pathToCheck) => {
    if (!pathToCheck) {
      setValidation({ valid: false, checking: false, error: "" });
      return;
    }

    if (validateTimer.current) {
      clearTimeout(validateTimer.current);
    }

    setValidation((prev) => ({ ...prev, checking: true, error: "" }));

    validateTimer.current = setTimeout(async () => {
      try {
        const res = await window.api.validateFolder(pathToCheck);
        if (res && res.valid) {
          setValidation({ valid: true, checking: false, error: "" });
        } else {
          setValidation({
            valid: false,
            checking: false,
            error: res && res.error ? res.error : "Invalid folder"
          });
        }
      } catch (e) {
        setValidation({
          valid: false,
          checking: false,
          error: "Error validating folder"
        });
      }
    }, 300);
  };

  const handleBrowse = async () => {
    setStatus("");
    try {
      const selected = await window.api.selectFolder();
      if (!selected) {
        setStatus("Folder selection canceled");
        return;
      }
      setFolderPath(selected);
      setStatus("Folder selected but not saved yet");
      runValidate(selected);
    } catch (e) {
      setStatus("Error selecting folder");
    }
  };

  const handleSave = async () => {
    if (!folderPath) {
      setStatus("Please select a folder first");
      return;
    }

    if (!validation.valid) {
      setStatus(
        `Cannot save: ${validation.error || "folder is invalid"}`
      );
      return;
    }

    try {
      const res = await window.api.saveFolder(folderPath);
      if (res && res.success) {
        setStatus("Folder path saved");
      } else {
        setStatus(
          `Error saving folder: ${
            res && res.error ? res.error : "unknown error"
          }`
        );
      }
    } catch (e) {
      setStatus("Error saving folder");
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setFolderPath(val);
    setStatus("");
    runValidate(val);
  };

  const renderValidationMessage = () => {
    if (validation.checking) {
      return (
        <div
          style={{
            marginTop: "6px",
            fontSize: "12px",
            color: "#555"
          }}
        >
          Checking...
        </div>
      );
    }

    if (!validation.valid && validation.error) {
      return (
        <div
          style={{
            marginTop: "6px",
            fontSize: "12px",
            color: "red"
          }}
        >
          {validation.error}
        </div>
      );
    }

    return null;
  };

  return (
    <div
      style={{
        padding: "24px",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        boxSizing: "border-box",
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start"
      }}
    >
      <div style={{ width: "100%", maxWidth: "600px" }}>
        <h1 style={{ marginTop: 0, marginBottom: "8px" }}>
          Localization Helper
        </h1>
        <p style={{ marginTop: 0, marginBottom: "16px" }}>
          Please specify the folder with translation files.
        </p>

        <div style={{ marginBottom: "8px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "4px",
              fontSize: "14px"
            }}
          >
            Selected folder:
          </label>

          <input
            type="text"
            value={folderPath}
            onChange={handleChange}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: "13px",
              boxSizing: "border-box"
            }}
            placeholder="Select or enter folder path..."
          />

          {renderValidationMessage()}
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "8px"
          }}
        >
          <button onClick={handleBrowse}>Browse folder…</button>
          <button
            onClick={handleSave}
            disabled={!validation.valid}
          >
            Save
          </button>
        </div>

        {status && (
          <div
            style={{
              marginTop: "8px",
              fontSize: "13px",
              opacity: 0.9
            }}
          >
            {status}
          </div>
        )}
      </div>
    </div>
  );
};

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
