/**
 * Enhanced Data Loader for All Weather Strategy
 * 全天候策略增强数据加载器
 * 
 * Features:
 * - Multiple data source fallback
 * - Detailed error messages
 * - Fund status checking
 */

export class AWLoaderEnhanced {
    constructor() {
        this.baseUrl = '/api';
        this.cache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Load fund data with enhanced error handling
     * 加载基金数据（增强错误处理）
     */
    async loadFundData(fundCode) {
        // Check cache first
        const cached = this.getFromCache(fundCode);
        if (cached) {
            return cached;
        }

        try {
            // Try enhanced API first
            const response = await fetch(`${this.baseUrl}/fund/${fundCode}/nav/enhanced`);
            const result = await response.json();

            if (result.success && result.data) {
                this.setCache(fundCode, result.data);
                return {
                    success: true,
                    data: result.data
                };
            }

            // If enhanced API fails, check fund status
            const statusResponse = await fetch(`${this.baseUrl}/fund/${fundCode}/status`);
            const statusResult = await statusResponse.json();

            return {
                success: false,
                error: result.error || '数据不可用',
                fundStatus: statusResult.data?.status || 'unknown',
                message: this.getErrorMessage(fundCode, result, statusResult),
                fundCode: fundCode
            };

        } catch (error) {
            console.error(`Failed to load fund ${fundCode}:`, error);
            return {
                success: false,
                error: error.message,
                message: `基金 ${fundCode} 数据加载失败，请稍后重试`
            };
        }
    }

    /**
     * Load all AW strategy funds with enhanced error handling
     * 加载所有全天候策略基金（增强错误处理）
     */
    async loadAllFunds() {
        try {
            const response = await fetch(`${this.baseUrl}/strategy/aw/funds/enhanced`);
            const result = await response.json();

            if (!result.success && result.errors.length > 0) {
                console.warn('Some funds failed to load:', result.errors);
            }

            if (result.warnings.length > 0) {
                result.warnings.forEach(warning => {
                    console.warn('Warning:', warning);
                });
            }

            return result;

        } catch (error) {
            console.error('Failed to load AW funds:', error);
            throw error;
        }
    }

    /**
     * Get user-friendly error message based on fund status
     * 根据基金状态获取用户友好的错误消息
     */
    getErrorMessage(fundCode, result, statusResult) {
        const status = statusResult.data?.status;
        const message = statusResult.data?.message;

        // Handle specific fund codes with known issues
        if (fundCode === '160216') {
            return '国泰大宗商品QDII-LOF数据暂时不可用。' +
                   '可能原因：QDII基金净值更新延迟（T+2），或场内交易已暂停。' +
                   '建议：使用备选商品类基金或等待数据更新。';
        }

        if (fundCode === '165513') {
            return '中信保诚主题QDII-FOF-LOF数据暂时不可用。' +
                   '可能原因：QDII基金净值更新延迟（T+2），或场内交易已暂停。' +
                   '建议：使用备选海外配置基金或等待数据更新。';
        }

        // Generic messages based on status
        switch (status) {
            case 'suspended':
                return `基金 ${fundCode} 已暂停交易或清盘。建议：请选择其他同类基金替代。`;
            
            case 'not_found':
                return `基金 ${fundCode} 不存在或已清盘。建议：请检查基金代码或更新配置。`;
            
            case 'unknown':
                return `基金 ${fundCode} 状态未知，数据暂时不可用。建议：稍后重试或联系技术支持。`;
            
            default:
                return message || result.error || '数据不可用';
        }
    }

    /**
     * Display enhanced error information in UI
     * 在界面中显示增强的错误信息
     */
    displayError(container, fundCode, errorInfo) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'fund-error-message';
        errorDiv.innerHTML = `
            <div class="error-header">
                <i class="icon-warning"></i>
                <span>基金 ${fundCode} 数据不可用</span>
            </div>
            <div class="error-details">
                <p>${errorInfo.message}</p>
                ${errorInfo.fundStatus ? `<p class="status">状态: ${this.getStatusText(errorInfo.fundStatus)}</p>` : ''}
            </div>
            <div class="error-actions">
                <button class="btn-retry" onclick="retryLoadFund('${fundCode}')">重试</button>
                <button class="btn-alternatives" onclick="showAlternatives('${fundCode}')">查看替代基金</button>
            </div>
        `;
        container.appendChild(errorDiv);
    }

    /**
     * Get status text in Chinese
     * 获取状态的中文文本
     */
    getStatusText(status) {
        const statusMap = {
            'active': '正常',
            'suspended': '已暂停',
            'not_found': '不存在',
            'unknown': '未知'
        };
        return statusMap[status] || status;
    }

    /**
     * Cache management
     */
    getFromCache(fundCode) {
        const cached = this.cache.get(fundCode);
        if (!cached) return null;

        const now = Date.now();
        if (now - cached.timestamp > this.cacheExpiry) {
            this.cache.delete(fundCode);
            return null;
        }

        return cached.data;
    }

    setCache(fundCode, data) {
        this.cache.set(fundCode, {
            data: data,
            timestamp: Date.now()
        });
    }

    clearCache() {
        this.cache.clear();
    }
}

// Export singleton instance
export const awLoader = new AWLoaderEnhanced();

// Global retry function
window.retryLoadFund = async (fundCode) => {
    awLoader.clearCache();
    const result = await awLoader.loadFundData(fundCode);
    // Trigger UI update
    window.dispatchEvent(new CustomEvent('fund-data-updated', { detail: { fundCode, result } }));
};

// Global alternatives function
window.showAlternatives = (fundCode) => {
    // Show alternative funds modal
    const alternatives = getAlternativeFunds(fundCode);
    // Display modal with alternatives
    console.log('Alternative funds for', fundCode, ':', alternatives);
};

/**
 * Get alternative funds for problematic fund codes
 * 获取有问题基金代码的替代基金
 */
function getAlternativeFunds(fundCode) {
    const alternatives = {
        '160216': [
            { code: '159980', name: '有色金属ETF', category: '商品类' },
            { code: '159985', name: '豆粕ETF', category: '商品类' },
            { code: '518880', name: '黄金ETF', category: '商品类' }
        ],
        '165513': [
            { code: '270042', name: '广发纳斯达克100', category: '海外指数' },
            { code: '000369', name: '广发全球医疗保健', category: '海外主动' },
            { code: '162415', name: '华宝标普油气', category: '海外行业' }
        ]
    };

    return alternatives[fundCode] || [];
}