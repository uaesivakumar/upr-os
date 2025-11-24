// ecosystem.config.cjs
// Use CommonJS syntax (module.exports) and a .cjs extension for explicit compatibility.
module.exports = {
  apps: [
    {
      name: 'upr-web',
      script: 'server.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
  ],
};