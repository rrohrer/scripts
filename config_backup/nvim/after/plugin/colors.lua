function EnsureCustomColorTheme(color)
  color = color or "gruvbox"
  vim.cmd.colorscheme(color)

  -- This fixes colors for the floating windows and respects transparency controls.
  -- Basically its telling nvim to ignore bg color.
  vim.api.nvim_set_hl(0, "Normal", { bg = "none" })
  vim.api.nvim_set_hl(0, "NormalFloat", { bg = "none" })
end

EnsureCustomColorTheme()
