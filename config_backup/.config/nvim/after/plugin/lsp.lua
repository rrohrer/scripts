local lsp = require('lsp-zero')

lsp.preset('recommended')

-- (Optional) Configure lua language server for neovim
lsp.nvim_workspace()

lsp.ensure_installed({
  'tsserver',
  'eslint',
  'rust_analyzer',
  'clangd',
  'bashls',
})

local cmp = require('cmp')
local cmp_select = { behavior = cmp.SelectBehavior.Select }
local cmp_mappings = lsp.defaults.cmp_mappings({
  ['<C-p>'] = cmp.mapping.select_prev_item(cmp_select),
  ['<C-n>'] = cmp.mapping.select_next_item(cmp_select),
  ['<C-y>'] = cmp.mapping.confirm({ select = true }),
  ["<C-Space>"] = cmp.mapping.complete(),
})

lsp.set_preferences({
  sign_icons = {}
})

lsp.setup_nvim_cmp({
  mapping = cmp_mappings
})

-- Generally MASON manages this, but mason doesn't know about gdscript
lsp.setup_servers({ 'gdscript' })

lsp.on_attach(function(client, bufnr)
  local opts = { buffer = bufnr, remap = false }

  vim.keymap.set("n", "gd", function() vim.lsp.buf.definition() end, opts)
  vim.keymap.set("n", "K", function() vim.lsp.buf.hover() end, opts)
  vim.keymap.set("n", "<leader>vws", function() vim.lsp.buf.workspace_symbol() end, opts)
  vim.keymap.set("n", "<leader>vd", function() vim.diagnostic.open_float() end, opts)
  vim.keymap.set("n", "[d", function() vim.diagnostic.goto_next() end, opts)
  vim.keymap.set("n", "]d", function() vim.diagnostic.goto_prev() end, opts)
  vim.keymap.set("n", "<leader>vca", function() vim.lsp.buf.code_action() end, opts)
  vim.keymap.set("n", "<leader>vrr", function() vim.lsp.buf.references() end, opts)
  vim.keymap.set("n", "<leader>vrn", function() vim.lsp.buf.rename() end, opts)
  vim.keymap.set("i", "<C-h>", function() vim.lsp.buf.signature_help() end, opts)
end)

lsp.setup()

-- Setup inline diagnostic messages
vim.diagnostic.config({
  virtual_text = true
})

-- Format on save.
local do_not_format = os.getenv("DO_NOT_FORMAT") or 0

if do_not_format == 0 then
  vim.api.nvim_create_autocmd({ "BufWritePre" }, {
    pattern = { "*" },
    command = "lua vim.lsp.buf.format()",
  })
end

-- this works but doesn't use the lsp-zero settings I made.
-- require'lspconfig'.gdscript.setup{}
