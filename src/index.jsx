const { useEffect, useState, useRef } = React;

const TOAST_DURATION = 3000;

const App = () => {
  const [folderPath, setFolderPath] = useState("");
  const [savedFolders, setSavedFolders] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "success",
    progress: 100
  });

  const [validation, setValidation] = useState({
    valid: false,
    checking: false,
    error: ""
  });

  const validateTimer = useRef(null);
  const toastStartTime = useRef(null);
  const toastFrame = useRef(null);

  const hideToast = () => {
    cancelAnimationFrame(toastFrame.current);
    setToast(prev => ({ ...prev, visible: false }));
  };

  const showToast = (message, type) => {
    cancelAnimationFrame(toastFrame.current);

    toastStartTime.current = performance.now();

    setToast({
      visible: true,
      message,
      type,
      progress: 100
    });

    const animate = (time) => {
      const elapsed = time - toastStartTime.current;
      const percent = Math.max(0, 100 - (elapsed / TOAST_DURATION) * 100);

      setToast(prev => ({ ...prev, progress: percent }));

      if (elapsed < TOAST_DURATION) {
        toastFrame.current = requestAnimationFrame(animate);
      } else {
        hideToast();
      }
    };

    toastFrame.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    const loadInitial = async () => {
      const saved = await window.api.getSavedFolder();
      if (saved) {
        setFolderPath(saved);
        runValidate(saved);
      }

      const folders = await window.api.getFolders();
      if (Array.isArray(folders)) {
        setSavedFolders(folders);
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

    setValidation(v => ({ ...v, checking: true, error: "" }));

    validateTimer.current = setTimeout(async () => {
      const res = await window.api.validateFolder(pathToCheck);
      if (res?.valid) {
        setValidation({ valid: true, checking: false, error: "" });
      } else {
        setValidation({
          valid: false,
          checking: false,
          error: res?.error || ""
        });
      }
    }, 300);
  };

  const handleBrowse = async () => {
    const selected = await window.api.selectFolder();
    if (!selected) return;

    setFolderPath(selected);
    runValidate(selected);
  };

  const handleSave = async () => {
    if (!validation.valid) {
      showToast("Invalid folder path", "error");
      return;
    }

    const res = await window.api.saveFolder(folderPath);
    if (!res?.success) {
      showToast("Failed to save folder", "error");
      return;
    }

    if (!savedFolders.includes(folderPath)) {
      const updated = [...savedFolders, folderPath];
      setSavedFolders(updated);
      await window.api.saveFolders(updated);
    }

    showToast("Folder saved", "success");
  };

  const deleteFolder = async (p) => {
    const updated = savedFolders.filter(x => x !== p);
    setSavedFolders(updated);
    await window.api.saveFolders(updated);
    showToast("Folder removed", "success");
  };

  const getFolderName = (p) =>
    p.replace(/\\/g, "/").split("/").pop();

  const toastColors = {
    success: {
      bg: "#c8e6c9",
      bar: "#2e7d32",
      text: "#1b5e20"
    },
    error: {
      bg: "#ffcdd2",
      bar: "#c62828",
      text: "#7f0000"
    }
  };

  const colors = toastColors[toast.type];

  return (
    <>
      {toast.visible && (
        <div
          onClick={hideToast}
          style={{
            position: "fixed",
            right: "16px",
            bottom: "16px",
            width: "260px",
            background: colors.bg,
            borderRadius: "6px",
            boxShadow: "0 6px 16px rgba(0,0,0,0.25)",
            overflow: "hidden",
            cursor: "pointer",
            zIndex: 1000
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              fontSize: "13px",
              color: colors.text
            }}
          >
            {toast.message}
          </div>

          <div
            style={{
              height: "3px",
              width: `${toast.progress}%`,
              background: colors.bar
            }}
          />
        </div>
      )}

      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.25)",
            zIndex: 10
          }}
        />
      )}

      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          height: "100vh",
          width: "260px",
          background: "#f4f4f4",
          borderRight: "1px solid #ccc",
          padding: "16px",
          boxSizing: "border-box",
          transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.25s ease",
          zIndex: 11
        }}
      >
        <h3>Saved folders</h3>

        {savedFolders.map(p => (
          <div
            key={p}
            onClick={() => {
              setFolderPath(p);
              runValidate(p);
              setSidebarOpen(false);
            }}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "6px 8px",
              borderRadius: "4px",
              cursor: "pointer",
              background: "#fff",
              marginBottom: "4px"
            }}
          >
            <span
              style={{
                fontSize: "13px",
                maxWidth: "180px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {getFolderName(p)}
            </span>

            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteFolder(p);
              }}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "#900"
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div style={{ padding: "24px", fontFamily: "system-ui, sans-serif" }}>
        <button
          onClick={() => setSidebarOpen(true)}
          style={{
            width: "42px",
            height: "42px",
            fontSize: "22px",
            background: "transparent",
            border: "none",
            cursor: "pointer"
          }}
        >
          ≡
        </button>

        <h1>Localization Helper</h1>
        <p>Please specify the folder with translation files.</p>

        <input
          value={folderPath}
          onChange={e => {
            setFolderPath(e.target.value);
            runValidate(e.target.value);
          }}
          style={{
            width: "100%",
            padding: "6px 8px",
            fontSize: "13px",
            boxSizing: "border-box"
          }}
          placeholder="Select or enter folder path..."
        />

        {validation.checking && <div>Checking...</div>}
        {!validation.valid && validation.error && (
          <div style={{ color: "red" }}>{validation.error}</div>
        )}

        <div style={{ marginTop: "10px", display: "flex", gap: "8px" }}>
          <button onClick={handleBrowse}>Browse</button>
          <button onClick={handleSave} disabled={!validation.valid}>
            Save
          </button>
        </div>
      </div>
    </>
  );
};

ReactDOM.render(<App />, document.getElementById("root"));
