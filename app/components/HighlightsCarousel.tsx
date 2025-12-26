useEffect(() => {
  let alive = true;

  setLoading(true);
  setErr("");

  readCsvFromPublic(filePath)
    .then(({ rows }) => {
      if (!alive) return;
      setRows(rows as unknown as HfRow[]);
      setLoading(false);
    })
    .catch((e) => {
      if (!alive) return;
      setErr(e?.message ?? "Error leyendo CSV");
      setLoading(false);
    });

  return () => {
    alive = false;
  };
}, [filePath]);
