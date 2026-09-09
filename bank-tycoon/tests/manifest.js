/* ============================================================
   tests/manifest.js — 模組載入順序（唯一真相來源）
   bank-tycoon.html 的 <script> 順序必須與這裡一致；
   tests/manifest.test.js 會驗證。
   ============================================================ */
'use strict';
module.exports = {
  engine: [
    'core/util.js', 'core/registry.js', 'config/config.js',
    'data/levels.js', 'data/customers.js', 'data/stocks.js', 'data/products.js',
    'data/security.js', 'data/robbers.js', 'data/insurance.js', 'data/printer.js',
    'data/ratings.js', 'data/events.js',
    'systems/economy.js', 'systems/reports.js', 'systems/treasury.js', 'systems/credit.js',
    'systems/customers.js', 'systems/deposits.js', 'systems/stocks.js', 'systems/products.js',
    'systems/upgrades.js', 'systems/printer.js', 'systems/security.js', 'systems/robbery.js',
    'systems/insurance.js', 'systems/events.js', 'systems/bankruptcy.js', 'systems/simulation.js',
    'save/state.js', 'save/save.js', 'game.js',
  ],
  ui: [
    'ui/dom.js', 'ui/chart.js', 'ui/topbar.js', 'ui/panels-bank.js', 'ui/panels-invest.js',
    'ui/panels-security.js', 'ui/panels-report.js', 'ui/modals.js', 'ui/app.js', 'main.js',
  ],
};
