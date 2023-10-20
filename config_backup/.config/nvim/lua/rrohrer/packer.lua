-- Only required if you have packer configured as `opt`
vim.cmd [[packadd packer.nvim]]

return require('packer').startup(function(use)
  -- Packer can manage itself
  use 'wbthomason/packer.nvim'

  -- Telescope is the fuzzy file finder!
  use {
    'nvim-telescope/telescope.nvim', tag = '0.1.4',
    requires = { { 'nvim-lua/plenary.nvim', tag = 'v0.1.4' } }
  }

  -- Color theme: GruvBox and gruvbox material
  use('gruvbox-community/gruvbox')
  use('sainnhe/gruvbox-material')

  -- TreeSitter for enhanced highlighting
  use({ 'nvim-treesitter/nvim-treesitter', tag = 'v0.9.1', run = ':TSUpdate' })

  -- Harpoon allows jumping around files.
  use('theprimeagen/harpoon')

  -- Undotree gives you a full tree for undo/redo.
  -- use('mbbill/undotree')

  --LSP Setup
  use {
    'VonHeikemen/lsp-zero.nvim',
    branch = 'v1.x',
    requires = {
      -- LSP Support
      { 'neovim/nvim-lspconfig' },                     -- Required
      { 'williamboman/mason.nvim' },                   -- Optional
      { 'williamboman/mason-lspconfig.nvim' },         -- Optional

      -- Autocompletion
      { 'hrsh7th/nvim-cmp' },                 -- Required
      { 'hrsh7th/cmp-nvim-lsp' },             -- Required
      { 'hrsh7th/cmp-buffer' },               -- Optional
      { 'hrsh7th/cmp-path' },                 -- Optional
      { 'saadparwaiz1/cmp_luasnip' },         -- Optional
      { 'hrsh7th/cmp-nvim-lua' },             -- Optional

      -- Snippets
      { 'L3MON4D3/LuaSnip' },                     -- Required
      { 'rafamadriz/friendly-snippets' },         -- Optional
    }
  }
end)
