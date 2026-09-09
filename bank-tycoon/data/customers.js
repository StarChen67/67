/* ============================================================
   data/customers.js — 客戶類型與姓名產生器
   欄位：
     initial      初始餘額範圍（對數均勻）
     deposit      單次存款金額範圍
     pDeposit / pWithdraw   每日存款 / 提款機率
     withdrawFrac 提款時提走餘額的比例範圍
     minCredit    低於此信用分數時，這類客戶會開始離開、也不會再來
   ============================================================ */
(function (root) {
  'use strict';
  const BT = root.BT;

  BT.define('customerTypes', [
    {
      id: 'retail', name: '散戶', icon: '👤', color: '#8fd3ff',
      initial: [3000, 40000], deposit: [800, 6000],
      pDeposit: 0.06, pWithdraw: 0.04, withdrawFrac: [0.10, 0.50], minCredit: 0,
    },
    {
      id: 'small_biz', name: '小商家', icon: '🏪', color: '#7ce0b0',
      initial: [30000, 400000], deposit: [12000, 120000],
      pDeposit: 0.08, pWithdraw: 0.07, withdrawFrac: [0.20, 0.60], minCredit: 360,
    },
    {
      id: 'vip', name: '貴賓', icon: '💎', color: '#ffd76a',
      initial: [300000, 5000000], deposit: [70000, 750000],
      pDeposit: 0.04, pWithdraw: 0.03, withdrawFrac: [0.10, 0.40], minCredit: 480,
    },
    {
      id: 'corp', name: '企業', icon: '🏢', color: '#c9a6ff',
      initial: [3000000, 60000000], deposit: [1800000, 20000000],
      pDeposit: 0.05, pWithdraw: 0.05, withdrawFrac: [0.20, 0.70], minCredit: 600,
    },
    {
      id: 'inst', name: '機構', icon: '🏛️', color: '#ff9d6a',
      initial: [50000000, 800000000], deposit: [30000000, 400000000],
      pDeposit: 0.03, pWithdraw: 0.03, withdrawFrac: [0.30, 0.80], minCredit: 700,
    },
  ]);

  /* 姓名：姓 × 名 組合，足夠讓幾千位客戶不重覆到違和。 */
  BT.NAMES = {
    surname: ['陳', '林', '黃', '張', '李', '王', '吳', '劉', '蔡', '楊', '許', '鄭', '謝', '洪', '郭', '邱', '曾', '廖', '賴', '徐', '周', '葉', '蘇', '莊', '呂', '江', '何', '蕭', '羅', '高'],
    given: ['志明', '淑芬', '家豪', '雅婷', '俊傑', '怡君', '建宏', '美玲', '冠廷', '心怡', '宗翰', '思穎', '柏翰', '欣怡', '承恩', '筱涵', '偉倫', '佳蓉', '哲維', '子瑄', '世傑', '婉如', '文彬', '曉薇', '育誠', '佩君', '明哲', '雅雯', '國豪', '靜宜'],
    bizPrefix: ['永昌', '大興', '福記', '金鼎', '順發', '長榮', '合豐', '鴻運', '泰安', '新光', '中興', '興業', '振豐', '德昌', '協力'],
    bizSuffix: ['商行', '五金行', '早餐店', '機械廠', '貿易社', '藥局', '食品行', '印刷廠', '車行', '布莊'],
    corpPrefix: ['宏遠', '台盛', '亞太', '環宇', '光華', '首選', '巨山', '青雲', '啟明', '恆基', '雋永', '天宇'],
    corpSuffix: ['科技', '控股', '實業', '建設', '國際', '生技', '能源', '電子', '製藥', '物流'],
    instName: ['公務人員退休基金', '國家主權基金', '大學校務基金', '勞工保險基金', '壽險資金部', '央行外匯操作室', '產業投資公司', '教會信託基金'],
  };
})(typeof window !== 'undefined' ? window : globalThis);
