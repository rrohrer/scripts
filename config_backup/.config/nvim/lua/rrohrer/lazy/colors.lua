function EnsureCustomColorTheme(color)
  color = color or "gruvbox-material"

  vim.o.termguicolors = true

  -- Configure gruvbox material
  vim.g.gruvbox_material_background = 'soft'
  vim.g.gruvbox_material_foreground = 'material'
  vim.g.gruvbox_material_diagnostic_text_highlight = 1
  vim.g.gruvbox_material_diagnostic_line_highlight = 1
  vim.g.gruvbox_material_diagnostic_virtual_text = 'colored'

  -- Set the color scheme.
  vim.cmd.colorscheme(color)

  -- Customization for TelescopeBorder
  vim.cmd [[highlight TelescopeBorder guifg=#7daea3]]
  vim.cmd [[highlight DiffAdd guifg=#a9b665 guibg=#424a3e]]
  vim.cmd [[highlight TelescopeSelection guifg=#7daea3 guibg=#404946]]

  -- This fixes colors for the floating windows and respects transparency controls.
  -- Basically its telling nvim to ignore bg color.
  -- vim.api.nvim_set_hl(0, "Normal", { bg = "none" })
  -- vim.api.nvim_set_hl(0, "NormalFloat", { bg = "none" })
end

return {
  "sainnhe/gruvbox-material",
  config = function()
    EnsureCustomColorTheme()
  end
}
