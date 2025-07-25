return {
  "nvim-telescope/telescope.nvim",
  config = function()
    local builtin = require('telescope.builtin')
    vim.keymap.set('n', '<leader>ff', builtin.find_files, {})
    vim.keymap.set('n', '<leader>fg', builtin.live_grep, {})
    vim.keymap.set('n', '<leader>sw', builtin.lsp_dynamic_workspace_symbols, {})
    vim.keymap.set('n', '<leader>sf', builtin.lsp_document_symbols, {})
  end
}
