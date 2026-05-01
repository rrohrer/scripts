return {
  -- LSP
  {
    "neovim/nvim-lspconfig",
    dependencies = {
      "mason-org/mason.nvim",
      "mason-org/mason-lspconfig.nvim",
      "j-hui/fidget.nvim",
      "saghen/blink.cmp",
    },
    config = function()
      require("fidget").setup({})
      require("mason").setup()
      require("mason-lspconfig").setup({
        ensure_installed = {
          "lua_ls", "rust_analyzer", "zls", "clangd", "bashls",
        },
        -- v2: replaces the old `handlers = { ... }` pattern.
        -- Calls vim.lsp.enable() for every installed server.
        automatic_enable = true,
      })

      -- Apply blink.cmp's extra capabilities to every LSP, globally.
      vim.lsp.config("*", {
        capabilities = require("blink.cmp").get_lsp_capabilities(),
      })

      -- Per-server overrides. These get merged on top of whatever
      -- nvim-lspconfig ships in its lsp/<name>.lua files.
      vim.lsp.config("lua_ls", {
        settings = {
          Lua = {
            format = {
              enable = true,
              defaultConfig = {
                indent_style = "space",
                indent_size  = "2",
              },
            },
          },
        },
      })

      vim.lsp.config("zls", {
        -- replaces lspconfig.util.root_pattern(...)
        root_markers = { ".git", "build.zig", "zls.json" },
        settings = {
          zls = {
            enable_inlay_hints = true,
            enable_snippets    = true,
            warn_style         = true,
          },
        },
      })
      vim.g.zig_fmt_parse_errors = 0
      vim.g.zig_fmt_autosave = 0

      -- Diagnostics. Note: `source = "always"` was deprecated; use `true`.
      vim.diagnostic.config({
        virtual_text = true,
        float = {
          focusable = false,
          style     = "minimal",
          border    = "rounded",
          source    = true,
          header    = "",
          prefix    = "",
        },
      })

      -- Format on save
      if (os.getenv("DO_NOT_FORMAT") or "0") == "0" then
        vim.api.nvim_create_autocmd("BufWritePre", {
          pattern = "*",
          callback = function(args)
            vim.lsp.buf.format({ bufnr = args.buf })
          end,
        })
      end
    end,
  },

  -- Completion: blink.cmp replaces nvim-cmp + cmp-nvim-lsp + cmp-buffer
  -- + cmp-path + cmp-cmdline + cmp_luasnip in a single plugin.
  {
    "saghen/blink.cmp",
    version = "1.*", -- pinned to a stable release with prebuilt binary
    dependencies = {
      "L3MON4D3/LuaSnip",
      "rafamadriz/friendly-snippets", -- optional snippet library
    },
    event = "InsertEnter",
    ---@module 'blink.cmp'
    ---@type blink.cmp.Config
    opts = {
      keymap = {
        -- Closest to your old C-p / C-n / C-y / C-space mappings:
        preset = "default",
        ["<C-p>"] = { "select_prev", "fallback" },
        ["<C-n>"] = { "select_next", "fallback" },
        ["<C-y>"] = { "select_and_accept" },
        ["<C-Space>"] = { "show", "fallback" },
      },
      snippets = { preset = "luasnip" },
      sources = {
        default = { "lsp", "path", "snippets", "buffer" },
      },
      completion = {
        documentation = { auto_show = true, auto_show_delay_ms = 200 },
      },
      fuzzy = { implementation = "prefer_rust_with_warning" },
    },
  },
}
