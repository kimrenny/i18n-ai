const { useEffect, useState, useRef } = React;

const App = () => {
  const [folderPath, setFolderPath] = useState("");
  const [status, setStatus] = useState("");
  const [savedFolders, setSavedFolders] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [validation, setValidation] = useState({
    valid: false,
    checking: false,
    error: ""
  });

  const validateTimer = useRef(null);

  useEffect(() => {
    const loadInitial = async () => {
      try {
        const saved = await window.api.getSavedFolder();
        if (saved) {
          setFolderPath(saved);
          runValidate(saved);
        }

        const allFolders = await window.api.getFolders();
        if (Array.isArray(allFolders)) {
          setSavedFolders(allFolders);
        }

      } catch (e) {
        setStatus("Error loading saved folders");
      }
    };

    loadInitial();
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

        if (!savedFolders.includes(folderPath)) {
          const newArr = [...savedFolders, folderPath];

          setSavedFolders(newArr);

          await window.api.saveFolders(newArr);
        }

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

  const selectSaved = (p) => {
    setFolderPath(p);
    runValidate(p);
    setSidebarOpen(false);
  };

  const deleteFolder = async (p) => {
    const newArr = savedFolders.filter(x => x !== p);
    setSavedFolders(newArr);

    await window.api.saveFolders(newArr);
  };

  const renderValidationMessage = () => {
    if (validation.checking) {
      return (
        <div style={{ marginTop: "6px", fontSize: "12px", color: "#555" }}>
          Checking...
        </div>
      );
    }

    if (!validation.valid && validation.error) {
      return (
        <div style={{ marginTop: "6px", fontSize: "12px", color: "red" }}>
          {validation.error}
        </div>
      );
    }

    return null;
  };

  const getFolderName = (p) =>
    p.replace(/\\/g, "/").split("/").pop();

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          width: sidebarOpen ? "260px" : "0px",
          transition: "0.25s",
          overflow: "hidden",
          background: "#f3f3f3",
          borderRight: "1px solid #ccc",
          padding: sidebarOpen ? "16px" : "0"
        }}
      >
        <h3>Saved folders</h3>

        {savedFolders.map((p) => (
          <div
            key={p}
            style={{
              padding: "6px 0",
              display: "flex",
              justifyContent: "space-between",
              cursor: "pointer",
              borderBottom: "1px solid #ddd"
            }}
          >
            <span onClick={() => selectSaved(p)}>
              {getFolderName(p)}
            </span>
            <button
              onClick={() => deleteFolder(p)}
              style={{ marginLeft: "10px" }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div
        style={{
          flex: 1,
          padding: "24px",
          boxSizing: "border-box"
        }}
      >
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            width: "42px",
            height: "42px",
            fontSize: "24px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            marginBottom: "10px"
          }}
        >
          ≡
        </button>

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
