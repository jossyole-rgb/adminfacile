const paths = {
  home: "M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  pen: "m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15Z",
  file: "M14 2H5a1 1 0 0 0-1 1v18h16V8ZM14 2v6h6M8 12h8M8 16h6",
  clock: "M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  spark:
    "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 3v4M18 5h4",
  diamond: "m12 3 9 9-9 9-9-9ZM3 12h18M12 3l4 9-4 9-4-9Z",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  chevron: "m9 5 7 7-7 7",
  menu: "M4 6h16M4 12h16M4 18h16",
  upload: "M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6",
  check: "m5 12 4 4L19 6",
  copy: "M9 9h12v12H9ZM15 9V3H3v12h6",
  trash: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
  send: "m3 3 19 9-19 9 4-9ZM7 12h15",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-3a8 8 0 0 1 16 0v3",
  logout: "M9 3H3v18h6M9 12h12m-5-5 5 5-5 5",
  help: "M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  download: "M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4",
  mail: "M3 5h18v14H3ZM3 5l9 8 9-8",
  lock: "M6 10h12v11H6ZM8 10V6a4 4 0 0 1 8 0v4",
};
export const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.file}"/></svg>`;
