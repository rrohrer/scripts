vim.g.mapleader = " "
vim.keymap.set("n", "<leader>fv", vim.cmd.Ex)

-- Center the screen after D and U and searches
vim.keymap.set("n", "<C-d>", "<C-d>zz")
vim.keymap.set("n", "<C-u>", "<C-u>zz")
vim.keymap.set("n", "n", "nzzzv")
vim.keymap.set("n", "N", "Nzzzv")

-- Allow prettier format of html in rust (yew macros)
vim.keymap.set("n", "<leader>fp", "vi{:! prettier --parser html --stdin-filepath<CR>vi{>vi{>")
