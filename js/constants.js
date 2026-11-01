/**
 * ============================================================================
 * SMART SPLIT - CONSTANTS (js/constants.js)
 * Modern fintech palette & category mapping
 * ============================================================================
 */

window.SmartSplit = window.SmartSplit || {};

window.SmartSplit.Constants = {
  // Sophisticated, accessible modern fintech palette
  AVATAR_COLORS: [
    '#4F46E5', // Indigo
    '#059669', // Emerald
    '#D97706', // Amber
    '#7C3AED', // Violet
    '#DB2777', // Pink
    '#0891B2', // Cyan
    '#EA580C', // Orange
    '#2563EB', // Blue
    '#475569'  // Slate
  ],

  // Keyword to category icon mapping (returns icon key from js/icons.js)
  CATEGORY_MAP: {
    'ที่พัก': 'hotel',
    'โรงแรม': 'hotel',
    'โรงเเรม': 'hotel',
    'รีสอร์ท': 'hotel',
    'วิลล่า': 'hotel',
    'โฮสเทล': 'hotel',

    'ข้าว': 'food',
    'อาหาร': 'food',
    'หมูกระทะ': 'food',
    'ชาบู': 'food',
    'บุฟเฟต์': 'food',
    'มื้อ': 'food',
    'กิน': 'food',

    'น้ำมัน': 'transport',
    'รถ': 'transport',
    'ตั๋ว': 'transport',
    'ทางด่วน': 'transport',
    'แก๊ส': 'transport',
    'บัส': 'transport',
    'เครื่องบิน': 'transport',
    'grab': 'transport',
    'bolt': 'transport',

    'กาแฟ': 'cafe',
    'ขนม': 'cafe',
    'ชา': 'cafe',
    'เหล้า': 'cafe',
    'เบียร์': 'cafe',
    'น้ำ': 'cafe',
    'บาร์': 'cafe',

    'ของ': 'shopping',
    'ซื้อของ': 'shopping',
    'เซเว่น': 'shopping',
    '7-11': 'shopping',
    'ห้าง': 'shopping',
    'ตลาด': 'shopping',
    'ช้อป': 'shopping'
  }
};
