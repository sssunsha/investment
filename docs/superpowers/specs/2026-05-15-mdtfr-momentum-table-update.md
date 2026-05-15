# MDTFR Momentum Monitoring Table Update

**Date:** 2026-05-15  
**Feature:** 标的池动量监控表格调整

## Changes Implemented / 实现的变更

### 1. Hidden Columns with Tooltip / 隐藏列并添加悬浮提示

**Requirement / 需求:**
- Remove A类代码 and 场内ETF columns from visible table
- Show these values in a tooltip when hovering over C类代码

**Implementation / 实现:**

#### Backend (routers/strategy.py)
- No changes needed, backend continues to provide `a_code` and `etf_code` in the response

#### Frontend (js/mdtfr/table.js)
- Added `createTooltip()`, `showTooltip()`, and `hideTooltip()` functions
- Modified C类代码 cell rendering to:
  - Add dotted underline style to indicate interactivity
  - Add mouseenter/mouseleave event listeners
  - Display tooltip with A类代码 and 场内ETF values

#### Configuration (js/mdtfr/config.js)
- Removed `a_code` and `etf_code` from `POOL_MONITOR_COLUMNS`
- Added `hasTooltip: true` flag to `c_code` column

#### Styling (css/mdtfr.css)
- Added `.mdtfr-code-tooltip` styles with dark theme
- Responsive positioning below the hovered element

### 2. Additional Momentum Columns / 添加动量列

**Requirement / 需求:**
- Add three new momentum columns alongside 近20日涨跌:
  - 近10日涨跌 (10-day change)
  - 近5日涨跌 (5-day change)
  - 上一日涨跌 (1-day change)

**Implementation / 实现:**

#### Backend (routers/strategy.py)
Added calculations for:
```python
change_10d  # 10-day percentage change
change_5d   # 5-day percentage change
change_1d   # 1-day percentage change
```

Logic:
- Uses `recent_prices` DataFrame with 60 days of historical data
- Calculates percentage change: `(current_price - past_price) / past_price * 100`
- Handles cases where insufficient data exists (returns 0)
- Rounds to 2 decimal places

#### Frontend (js/mdtfr/config.js)
Added columns to `POOL_MONITOR_COLUMNS`:
- `change_10d` - 近10日涨跌 (width: 100px)
- `change_5d` - 近5日涨跌 (width: 90px)
- `change_1d` - 上一日涨跌 (width: 90px)

#### Frontend (js/mdtfr/table.js)
Extended the change percentage rendering logic to handle all momentum columns:
- Unified formatting using `formatChange()` function
- Color coding: green (#00b578) for positive, red (#ff3141) for negative
- Case statement handles all change columns uniformly

## Technical Details / 技术细节

### Data Flow / 数据流
1. Backend fetches 60 days of historical price data
2. Calculates multiple period changes (1d, 5d, 10d, 20d)
3. Returns JSON with all change metrics
4. Frontend renders visible columns + stores hidden data
5. Tooltip displays on hover using stored hidden data

### Column Order / 列顺序
```
排名 > 属性 > 名称 > C类代码* > 最新收盘 > 
近20日涨跌 > 近10日涨跌 > 近5日涨跌 > 上一日涨跌 > 
收盘/MA20 > MA60趋势 > 份额 > 金额(元) > 持仓情况(%)
```
*C类代码 shows tooltip with A类代码 and 场内ETF on hover

### Browser Compatibility / 浏览器兼容性
- Uses standard DOM APIs (no framework dependencies)
- Tooltip positioning uses `getBoundingClientRect()`
- CSS uses rgba() for transparency
- Should work in all modern browsers

## Testing Checklist / 测试清单

- [ ] Verify A类代码 and 场内ETF columns are hidden
- [ ] Verify tooltip appears on C类代码 hover
- [ ] Verify tooltip shows correct A类代码 and 场内ETF values
- [ ] Verify tooltip disappears on mouse leave
- [ ] Verify 近10日涨跌 column displays with correct values
- [ ] Verify 近5日涨跌 column displays with correct values
- [ ] Verify 上一日涨跌 column displays with correct values
- [ ] Verify color coding works for all change columns
- [ ] Verify table layout and column widths are appropriate
- [ ] Test with different data scenarios (positive/negative changes)

## Files Modified / 修改的文件

1. `routers/strategy.py` - Added change_10d, change_5d, change_1d calculations
2. `js/mdtfr/config.js` - Updated column configuration
3. `js/mdtfr/table.js` - Added tooltip functionality and extended rendering logic
4. `css/mdtfr.css` - Added tooltip styles

## Rollback Plan / 回滚方案

If issues arise, revert changes in reverse order:
1. Remove CSS tooltip styles
2. Revert table.js tooltip logic
3. Restore a_code and etf_code columns in config.js
4. Remove new change calculations from strategy.py

Git revert commit: `git revert HEAD`