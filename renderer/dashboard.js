// dashboard.js - 优化图表标注和循环动画效果
class Dashboard {
    constructor() {
        this.data = null;
        this.chartConfigs = {
            userRanking: { type: 'bar' },
            platform: { type: 'doughnut' },
            region: { type: 'bar' },
            category: { type: 'pie' },
            timeTrend: { period: 'three_days' }
        };
        this.animationsEnabled = true;
        this.animationIntervals = new Map();
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.showDemoData();
        await this.loadData();
        this.startAutoRefresh();
        this.setupAnimationControls();
    }

    setupEventListeners() {
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadData();
        });

        document.querySelectorAll('.chart-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const chartType = e.target.dataset.chart;
                const dataType = e.target.dataset.type;
                const period = e.target.dataset.period;
                
                if (chartType) {
                    this.switchChartType(chartType, dataType, period, e.target);
                }
            });
        });
    }

    setupAnimationControls() {
        // 为所有图表容器添加鼠标事件
        const chartContainers = document.querySelectorAll('.chart-container, .pie-svg-container, .activity-list');
        
        chartContainers.forEach(container => {
            container.addEventListener('mouseenter', () => {
                this.pauseAnimations(container);
            });
            
            container.addEventListener('mouseleave', () => {
                this.resumeAnimations(container);
            });
        });
    }

    pauseAnimations(container) {
        // 暂停CSS动画
        const animatedElements = container.querySelectorAll('*');
        animatedElements.forEach(element => {
            if (element.style.animationPlayState !== 'paused') {
                element.style.animationPlayState = 'paused';
            }
        });

        // 暂停环形图旋转
        const pieContainer = container.closest('.pie-svg-container');
        if (pieContainer) {
            pieContainer.style.animationPlayState = 'paused';
        }

        // 暂停动态滚动
        const activityScroll = container.querySelector('.activity-scroll');
        if (activityScroll) {
            activityScroll.style.animationPlayState = 'paused';
        }

        // 清除所有interval动画
        this.animationIntervals.forEach((intervals, containerId) => {
            if (container.contains(document.getElementById(containerId))) {
                intervals.forEach(interval => clearInterval(interval));
            }
        });
    }

    resumeAnimations(container) {
        // 恢复CSS动画
        const animatedElements = container.querySelectorAll('*');
        animatedElements.forEach(element => {
            element.style.animationPlayState = 'running';
        });

        // 恢复环形图旋转
        const pieContainer = container.closest('.pie-svg-container');
        if (pieContainer) {
            pieContainer.style.animationPlayState = 'running';
        }

        // 恢复动态滚动
        const activityScroll = container.querySelector('.activity-scroll');
        if (activityScroll) {
            activityScroll.style.animationPlayState = 'running';
        }

        // 重新启动interval动画
        this.restartChartAnimations(container);
    }

    restartChartAnimations(container) {
        if (container.querySelector('.ranking-bar-fill')) {
            this.animateBars(container, '.ranking-bar-fill');
        }
        if (container.querySelector('.region-bar-fill')) {
            this.animateBars(container, '.region-bar-fill');
        }
        if (container.querySelector('.trend-bar-fill')) {
            this.animateBars(container, '.trend-bar-fill');
        }
        if (container.querySelector('.pie-segment')) {
            this.animatePieChart(container);
        }
    }

    animateBars(container, selector) {
        const bars = container.querySelectorAll(selector);
        bars.forEach((bar, index) => {
            const barId = `bar-${index}`;
            if (this.animationIntervals.has(barId)) {
                this.animationIntervals.get(barId).forEach(interval => clearInterval(interval));
            }

            const interval = setInterval(() => {
                if (this.animationsEnabled) {
                    bar.style.transition = 'transform 0.5s ease-in-out';
                    bar.style.transform = 'scaleX(1.05)';
                    
                    setTimeout(() => {
                        bar.style.transform = 'scaleX(1)';
                    }, 500);
                }
            }, 3000 + index * 600);

            this.animationIntervals.set(barId, [interval]);
        });
    }

    switchChartType(chartType, dataType, period, button) {
        const parent = button.closest('.chart-actions');
        parent.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
        button.classList.add('active');

        if (dataType) {
            this.chartConfigs[chartType].type = dataType;
        }
        if (period) {
            this.chartConfigs.timeTrend.period = period;
        }

        switch (chartType) {
            case 'userRanking':
                this.renderUserRankingChart();
                break;
            case 'platform':
                this.renderPlatformChart();
                break;
            case 'region':
                this.renderRegionChart();
                break;
            case 'category':
                this.renderCategoryChart();
                break;
            case 'timeTrend':
                this.renderTimeTrendChart();
                break;
        }
    }

    async loadData() {
        this.showLoading();
        
        try {
            const result = await window.electronAPI.getDashboardData();
            if (result && result.success) {
                // 添加时间调试信息
            console.log('=== 驾驶舱数据时间验证 ===');
            console.log('数据时间戳:', new Date(result.data.timestamp).toLocaleString());
            console.log('最近活动记录数量:', result.data.recent_activities?.length || 0);
            
            if (result.data.recent_activities) {
                result.data.recent_activities.forEach((activity, index) => {
                    console.log(`活动 ${index + 1}:`, activity.time, '-', activity.content);
                });
            }
            
            console.log('时间趋势数据 - 近三天:', result.data.time_analysis?.three_days || 0);
            console.log('时间趋势数据 - 近一周:', result.data.time_analysis?.one_week || 0);
                this.data = result.data;
                this.updateUI();
                this.renderCharts();
            } else {
                throw new Error(result?.message || '未知错误');
            }
        } catch (error) {
            console.error('加载驾驶舱数据失败:', error);
            this.data = this.getDemoData();
            this.updateUI();
            this.renderCharts();
            this.showError('数据加载失败，使用演示数据');
        } finally {
            this.hideLoading();
        }
    }

    showDemoData() {
        this.data = this.getDemoData();
        this.updateUI();
        this.renderCharts();
    }

    getDemoData() {
        return {
            summary: { 
                total_stores: 22, 
                total_users: 8, 
                today_new_stores: 2, 
                active_stores: 15 
            },
            user_ranking: [
                { user_name: "赵四", store_count: 10 },
                { user_name: "李四", store_count: 3 },
                { user_name: "asd", store_count: 3 },
                { user_name: "超级管理员", store_count: 2 },
                { user_name: "刘东", store_count: 2 }
            ],
            platform_distribution: [
                { platform: "饿了么", count: 5 },
                { platform: "美团", count: 5 },
                { platform: "抖音电商", count: 3 },
                { platform: "京东", count: 3 },
                { platform: "天猫", count: 3 },
                { platform: "拼多多", count: 2 },
                { platform: "饿了么零售", count: 1 }
            ],
            region_distribution: [
                { province: "山东省", count: 1 },
                { province: "江苏省", count: 3 },
                { province: "浙江省", count: 2 },
                { province: "广东省", count: 4 },
                { province: "北京市", count: 2 }
            ],
            category_distribution: [
                { category: "小吃", count: 8 },
                { category: "快餐简餐", count: 6 },
                { category: "地方菜", count: 4 },
                { category: "烧烤", count: 3 },
                { category: "火锅", count: 1 }
            ],
            time_analysis: {
                three_days: 5,
                one_week: 8,
                one_month: 15,
                three_months: 22
            },
            time_trend_by_platform: {
                threeDays: [
                    { platform: "美团", count: 2 },
                    { platform: "饿了么", count: 1 },
                    { platform: "抖音电商", count: 1 }
                ],
                oneWeek: [
                    { platform: "美团", count: 3 },
                    { platform: "饿了么", count: 2 },
                    { platform: "京东", count: 1 }
                ],
                oneMonth: [
                    { platform: "美团", count: 5 },
                    { platform: "饿了么", count: 4 },
                    { platform: "抖音电商", count: 3 }
                ],
                threeMonths: [
                    { platform: "美团", count: 8 },
                    { platform: "饿了么", count: 7 },
                    { platform: "抖音电商", count: 4 }
                ]
            },
            recent_activities: [
                { time: "2小时前", content: "用户「李四」新增了美团门店「李四烧烤店」 [地区: 山东省-济南市] [分类: 烧烤]" },
                { time: "5小时前", content: "用户「赵四」修改了饿了么门店「赵四快餐」的联系方式 [地区: 江苏省-南京市] [分类: 快餐简餐]" },
                { time: "昨天", content: "用户「asd」新增了抖音电商门店「asd服饰」 [地区: 浙江省-杭州市] [分类: 服饰]" },
                { time: "前天", content: "用户「刘东」修改了京东门店「刘东家电」的营业时间 [地区: 广东省-深圳市] [分类: 家电]" },
                { time: "3天前", content: "用户「超级管理员」新增了拼多多门店「测试店铺」 [地区: 北京市] [分类: 测试]" }
            ],
            timestamp: new Date().toISOString()
        };
    }

    updateUI() {
        if (!this.data) return;

        const { summary, time_analysis, recent_activities } = this.data;

        document.getElementById('totalStores').textContent = summary.total_stores.toLocaleString();
        document.getElementById('totalUsers').textContent = summary.total_users.toLocaleString();
        document.getElementById('activeStores').textContent = summary.active_stores.toLocaleString();
        document.getElementById('todayNewStores').textContent = summary.today_new_stores;

        const growthRate = time_analysis.one_month > 0 ? 
            ((time_analysis.three_months - time_analysis.one_month) / time_analysis.one_month * 100).toFixed(1) : 0;
        document.getElementById('growthRate').textContent = Math.abs(growthRate) + '%';

        document.getElementById('lastUpdate').textContent = 
            new Date(this.data.timestamp).toLocaleTimeString();

        this.renderActivities(recent_activities);
    }

    renderActivities(activities) {
        const container = document.getElementById('activityScroll');
        if (!container) return;

        let html = '';
        
        if (!activities || activities.length === 0) {
            html = `
                <div class="activity-item">
                    <span class="activity-content">暂无最近活动</span>
                </div>
            `;
        } else {
            activities.forEach(activity => {
                html += `
                    <div class="activity-item">
                        <span class="activity-time">${activity.time}</span>
                        <span class="activity-content">${activity.content}</span>
                    </div>
                `;
            });
        }

        html += html;
        container.innerHTML = html;

        container.style.animation = 'none';
        setTimeout(() => {
            container.style.animation = 'scrollActivities 20s linear infinite';
            container.style.animationPlayState = 'running';
        }, 10);

        this.setupActivityAnimationControl(container);
    }

    setupActivityAnimationControl(container) {
        const activityList = container.closest('.activity-list');
        if (activityList) {
            activityList.addEventListener('mouseenter', () => {
                container.style.animationPlayState = 'paused';
            });
            
            activityList.addEventListener('mouseleave', () => {
                if (this.animationsEnabled) {
                    container.style.animationPlayState = 'running';
                }
            });
        }
    }

    renderCharts() {
        if (!this.data) return;

        this.renderUserRankingChart();
        this.renderPlatformChart();
        this.renderRegionChart();
        this.renderCategoryChart();
        this.renderTimeTrendChart();
    }

    renderUserRankingChart() {
        const container = document.getElementById('userRankingChart');
        if (!container) return;

        const data = this.data.user_ranking;
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="no-data">暂无数据</div>';
            return;
        }

        const chartType = this.chartConfigs.userRanking.type;
        
        if (chartType === 'list') {
            this.renderUserRankingList(container, data);
        } else {
            this.renderUserRankingBar(container, data);
        }
    }

    renderUserRankingBar(container, data) {
        const maxValue = Math.max(...data.map(item => item.store_count));
        
        let html = '';
        data.forEach((item, index) => {
            const percentage = maxValue > 0 ? (item.store_count / maxValue) * 100 : 0;
            html += `
                <div class="ranking-bar">
                    <div class="ranking-info">
                        <span class="ranking-name">${index + 1}. ${item.user_name}</span>
                        <span class="ranking-value">${item.store_count}家</span>
                    </div>
                    <div class="ranking-bar-bg">
                        <div class="ranking-bar-fill" style="width: 0%" data-width="${percentage}"></div>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
        
        if (this.animationsEnabled) {
            setTimeout(() => {
                container.querySelectorAll('.ranking-bar-fill').forEach((bar, index) => {
                    const width = bar.getAttribute('data-width');
                    setTimeout(() => {
                        bar.style.width = `${width}%`;
                    }, index * 100);
                });
            }, 100);
        }

        this.animateBars(container, '.ranking-bar-fill');
        this.setupContainerAnimationControl(container);
    }

    renderUserRankingList(container, data) {
        let html = '';
        data.forEach((item, index) => {
            html += `
                <div class="ranking-bar">
                    <div class="ranking-info">
                        <span class="ranking-name">${index + 1}. ${item.user_name}</span>
                        <span class="ranking-value">${item.store_count}家</span>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
        this.setupContainerAnimationControl(container);
    }

    renderPlatformChart() {
        const container = document.getElementById('platformChart');
        if (!container) return;

        const data = this.data.platform_distribution;
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="no-data">暂无数据</div>';
            return;
        }

        const chartType = this.chartConfigs.platform.type;
        
        if (chartType === 'pie') {
            this.renderPlatformPieChart(container, data);
        } else {
            this.renderPlatformDoughnutChart(container, data);
        }
    }

    renderPlatformPieChart(container, data) {
        const total = data.reduce((sum, item) => sum + item.count, 0);
        const colors = ['#4facfe', '#00f2fe', '#667eea', '#764ba2', '#f093fb', '#f5576c', '#43e97b', '#38f9d7'];
        
        let cumulativePercentage = 0;
        let paths = [];
        
        data.forEach((item, index) => {
            const percentage = total > 0 ? (item.count / total) : 0;
            if (percentage === 0) return;
            
            const angle = percentage * 360;
            const largeArcFlag = angle > 180 ? 1 : 0;
            
            const startAngle = cumulativePercentage;
            const endAngle = startAngle + angle;
            
            const startRad = (startAngle - 90) * Math.PI / 180;
            const endRad = (endAngle - 90) * Math.PI / 180;
            
            const x1 = 50 + 50 * Math.cos(startRad);
            const y1 = 50 + 50 * Math.sin(startRad);
            const x2 = 50 + 50 * Math.cos(endRad);
            const y2 = 50 + 50 * Math.sin(endRad);
            
            const pathData = [
                `M 50 50`,
                `L ${x1} ${y1}`,
                `A 50 50 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                'Z'
            ].join(' ');
            
            paths.push(`<path d="${pathData}" fill="${colors[index % colors.length]}" stroke="rgba(255,255,255,0.1)" stroke-width="0.5" class="pie-segment" />`);
            cumulativePercentage += angle;
        });
        
        let labelsHtml = '';
        data.forEach((item, index) => {
            const percentage = total > 0 ? (item.count / total) : 0;
            if (percentage === 0) return;
            
            const percentText = (percentage * 100).toFixed(1);
            labelsHtml += `
                <div class="pie-label-item">
                    <div class="pie-label-color" style="background: ${colors[index % colors.length]}"></div>
                    <div class="pie-label-content">
                        <div class="pie-label-name">${item.platform}</div>
                        <div class="pie-label-value">${item.count}家 (${percentText}%)</div>
                    </div>
                </div>
            `;
        });
        
        const html = `
            <div class="pie-chart-container">
                <div class="chart-title">平台分布</div>
                <div class="pie-svg-container">
                    <svg viewBox="0 0 100 100" class="pie-svg">
                        ${paths.join('')}
                    </svg>
                </div>
                <div class="pie-labels-container">
                    <div class="pie-labels-list">
                        ${labelsHtml}
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        
        if (this.animationsEnabled) {
            this.animatePieChart(container);
        }
        
        this.setupContainerAnimationControl(container);
    }

    renderPlatformDoughnutChart(container, data) {
    const total = data.reduce((sum, item) => sum + item.count, 0);
    const colors = ['#4facfe', '#00f2fe', '#667eea', '#764ba2', '#f093fb', '#f5576c', '#43e97b', '#38f9d7'];
    
    let cumulativePercentage = 0;
    let paths = [];
    
    data.forEach((item, index) => {
        const percentage = total > 0 ? (item.count / total) : 0;
        if (percentage === 0) return;
        
        const angle = percentage * 360;
        const largeArcFlag = angle > 180 ? 1 : 0;
        
        const startAngle = cumulativePercentage;
        const endAngle = startAngle + angle;
        
        const startRad = (startAngle - 90) * Math.PI / 180;
        const endRad = (endAngle - 90) * Math.PI / 180;
        
        const x1 = 50 + 50 * Math.cos(startRad);
        const y1 = 50 + 50 * Math.sin(startRad);
        const x2 = 50 + 50 * Math.cos(endRad);
        const y2 = 50 + 50 * Math.sin(endRad);
        
        const x3 = 50 + 30 * Math.cos(endRad);
        const y3 = 50 + 30 * Math.sin(endRad);
        const x4 = 50 + 30 * Math.cos(startRad);
        const y4 = 50 + 30 * Math.sin(startRad);
        
        const pathData = [
            `M ${x1} ${y1}`,
            `A 50 50 0 ${largeArcFlag} 1 ${x2} ${y2}`,
            `L ${x3} ${y3}`,
            `A 30 30 0 ${largeArcFlag} 0 ${x4} ${y4}`,
            'Z'
        ].join(' ');
        
        paths.push(`<path d="${pathData}" fill="${colors[index % colors.length]}" stroke="rgba(255,255,255,0.1)" stroke-width="0.5" class="pie-segment" />`);
        cumulativePercentage += angle;
    });
    
    let labelsHtml = '';
    data.forEach((item, index) => {
        const percentage = total > 0 ? (item.count / total) : 0;
        if (percentage === 0) return;
        
        const percentText = (percentage * 100).toFixed(1);
        labelsHtml += `
            <div class="pie-label-item">
                <div class="pie-label-color" style="background: ${colors[index % colors.length]}"></div>
                <div class="pie-label-content">
                    <div class="pie-label-name">${item.platform}</div>
                    <div class="pie-label-value">${item.count}家 (${percentText}%)</div>
                </div>
            </div>
        `;
    });
    
    const html = `
        <div class="pie-chart-container doughnut-container">
            <div class="chart-title">平台分布</div>
            <div class="pie-svg-container">
                <svg viewBox="0 0 100 100" class="pie-svg">
                    ${paths.join('')}
                    <circle cx="50" cy="50" r="30" fill="rgba(15, 20, 33, 0.8)" />
                </svg>
                <div class="doughnut-center">
                    <div class="doughnut-total">${total}</div>
                    <div class="doughnut-label">门店总数</div>
                </div>
            </div>
            <div class="pie-labels-container">
                <div class="pie-labels-list">
                    ${labelsHtml}
                </div>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
    
    const centerText = container.querySelector('.doughnut-center');
    
    if (this.animationsEnabled) {
        const svgElement = container.querySelector('.pie-svg');
        if (svgElement) {
            svgElement.style.animation = 'rotatePie 30s linear infinite';
        }
        
        if (centerText) {
            centerText.style.animation = 'none';
        }
        
        this.animatePieChart(container);
    }
    
    this.setupContainerAnimationControl(container);
}

animatePieChart(container) {
    const svg = container.querySelector('.pie-svg');
    const centerText = container.querySelector('.doughnut-center');
    
    if (!svg) return;
    
    if (centerText) {
        centerText.style.animation = 'none';
        centerText.style.transform = 'none';
    }
    
    const paths = svg.querySelectorAll('.pie-segment');
    paths.forEach((path, index) => {
        path.style.opacity = '0';
        path.style.transformOrigin = '50% 50%';
        path.style.transform = 'scale(0)';
        
        setTimeout(() => {
            path.style.transition = 'all 0.8s ease-out';
            path.style.opacity = '1';
            path.style.transform = 'scale(1)';
            
            const interval = setInterval(() => {
                path.style.transition = 'transform 0.5s ease-in-out';
                path.style.transform = 'scale(1.05)';
                
                setTimeout(() => {
                    path.style.transform = 'scale(1)';
                }, 500);
            }, 3000 + index * 500);
            
            this.animationIntervals.set(`pie-${index}`, [interval]);
        }, index * 200);
    });
    
    const labels = container.querySelectorAll('.pie-label-item');
    labels.forEach((label, index) => {
        label.style.opacity = '0';
        label.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            label.style.transition = 'all 0.5s ease-out';
            label.style.opacity = '1';
            label.style.transform = 'translateY(0)';
            
            label.addEventListener('mouseenter', () => {
                label.style.transform = 'translateY(-5px) scale(1.05)';
                label.style.boxShadow = '0 10px 20px rgba(0,0,0,0.2)';
            });
            
            label.addEventListener('mouseleave', () => {
                label.style.transform = 'translateY(0) scale(1)';
                label.style.boxShadow = 'none';
            });
        }, 1000 + index * 100);
    });
}

    animatePieChart(container) {
        
        const svg = container.querySelector('.pie-svg');
        if (!svg) return;
        // 确保中心文字不参与任何动画
    
        const paths = svg.querySelectorAll('.pie-segment');
        paths.forEach((path, index) => {
            path.style.opacity = '0';
            path.style.transformOrigin = '50% 50%';
            path.style.transform = 'scale(0)';
            
            setTimeout(() => {
                path.style.transition = 'all 0.8s ease-out';
                path.style.opacity = '1';
                path.style.transform = 'scale(1)';
                
                const interval = setInterval(() => {
                    path.style.transition = 'transform 0.5s ease-in-out';
                    path.style.transform = 'scale(1.05)';
                    
                    setTimeout(() => {
                        path.style.transform = 'scale(1)';
                    }, 500);
                }, 3000 + index * 500);
                
                this.animationIntervals.set(`pie-${index}`, [interval]);
            }, index * 200);
        });
        
        const labels = container.querySelectorAll('.pie-label-item');
        labels.forEach((label, index) => {
            label.style.opacity = '0';
            label.style.transform = 'translateY(20px)';
            
            setTimeout(() => {
                label.style.transition = 'all 0.5s ease-out';
                label.style.opacity = '1';
                label.style.transform = 'translateY(0)';
                
                label.addEventListener('mouseenter', () => {
                    label.style.transform = 'translateY(-5px) scale(1.05)';
                    label.style.boxShadow = '0 10px 20px rgba(0,0,0,0.2)';
                });
                
                label.addEventListener('mouseleave', () => {
                    label.style.transform = 'translateY(0) scale(1)';
                    label.style.boxShadow = 'none';
                });
            }, 1000 + index * 100);
        });
    }

    setupContainerAnimationControl(container) {
        container.addEventListener('mouseenter', () => {
            this.pauseContainerAnimations(container);
        });
        
        container.addEventListener('mouseleave', () => {
            this.resumeContainerAnimations(container);
        });
    }

    pauseContainerAnimations(container) {
        const svgContainer = container.querySelector('.pie-svg-container');
        if (svgContainer) {
            svgContainer.style.animationPlayState = 'paused';
        }
        
        this.pauseAnimations(container);
    }

    resumeContainerAnimations(container) {
        const svgContainer = container.querySelector('.pie-svg-container');
        if (svgContainer) {
            svgContainer.style.animationPlayState = 'running';
        }
        
        this.resumeAnimations(container);
    }

    renderRegionChart() {
        const container = document.getElementById('regionChart');
        if (!container) return;

        const data = this.data.region_distribution;
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="no-data">暂无数据</div>';
            return;
        }

        const topFiveData = data.slice(0, 5);
        const maxValue = Math.max(...topFiveData.map(item => item.count));
        
        let html = '';
        topFiveData.forEach((item, index) => {
            const percentage = maxValue > 0 ? (item.count / maxValue) * 100 : 0;
            html += `
                <div class="region-bar">
                    <div class="region-info">
                        <span class="region-name">${item.province || '未知'}</span>
                        <span class="region-value">${item.count}家</span>
                    </div>
                    <div class="region-bar-bg">
                        <div class="region-bar-fill" style="width: 0%" data-width="${percentage}"></div>
                    </div>
                </div>
            `;
        });
        
        if (data.length > 5) {
            html += `<div class="more-regions">+ ${data.length - 5} 个地区</div>`;
        }
        
        container.innerHTML = html;
        
        if (this.animationsEnabled) {
            setTimeout(() => {
                container.querySelectorAll('.region-bar-fill').forEach((bar, index) => {
                    const width = bar.getAttribute('data-width');
                    setTimeout(() => {
                        bar.style.width = `${width}%`;
                    }, index * 150);
                });
            }, 100);
        }

        this.animateBars(container, '.region-bar-fill');
        this.setupContainerAnimationControl(container);
    }

    renderCategoryChart() {
        const container = document.getElementById('categoryChart');
        if (!container) return;

        const data = this.data.category_distribution;
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="no-data">暂无分类数据</div>';
            return;
        }

        const chartType = this.chartConfigs.category.type;
        
        if (chartType === 'verticalBar') {
            this.renderCategoryVerticalBarChart(container, data);
        } else {
            this.renderCategoryPieChart(container, data);
        }
    }

    renderCategoryVerticalBarChart(container, data) {
        const maxValue = Math.max(...data.map(item => item.count));
        const chartHeight = 120;
        const barWidth = 30;
        const spacing = 10;
        
        let html = '<div class="vertical-bar-chart">';
        
        const svgWidth = data.length * (barWidth + spacing) + spacing;
        html += `<svg width="${svgWidth}" height="${chartHeight + 30}" viewBox="0 0 ${svgWidth} ${chartHeight + 30}">`;
        
        html += `<line x1="${spacing}" y1="10" x2="${spacing}" y2="${chartHeight + 10}" stroke="rgba(255,255,255,0.3)" stroke-width="1" />`;
        html += `<line x1="${spacing}" y1="${chartHeight + 10}" x2="${svgWidth - spacing}" y2="${chartHeight + 10}" stroke="rgba(255,255,255,0.3)" stroke-width="1" />`;
        
        data.forEach((item, index) => {
            const x = spacing + index * (barWidth + spacing);
            const percentage = maxValue > 0 ? (item.count / maxValue) : 0;
            const barHeight = percentage * chartHeight;
            const y = chartHeight + 10 - barHeight;
            
            html += `<rect x="${x}" y="${chartHeight + 10}" width="${barWidth}" height="0" fill="#4facfe" rx="2" data-height="${barHeight}" data-y="${y}" class="vertical-bar" />`;
            
            const categoryName = item.category.length > 3 ? item.category.substring(0, 3) + '...' : item.category;
            html += `<text x="${x + barWidth/2}" y="${chartHeight + 25}" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-size="9">${categoryName}</text>`;
        });
        
        html += '</svg></div>';
        container.innerHTML = html;
        
        if (this.animationsEnabled) {
            setTimeout(() => {
                container.querySelectorAll('.vertical-bar').forEach((rect, index) => {
                    const height = rect.getAttribute('data-height');
                    const y = rect.getAttribute('data-y');
                    
                    setTimeout(() => {
                        rect.style.transition = 'height 0.8s ease-out, y 0.8s ease-out';
                        rect.setAttribute('height', height);
                        rect.setAttribute('y', y);
                        
                        const interval = setInterval(() => {
                            rect.style.transition = 'fill 0.5s ease-in-out';
                            rect.style.fill = '#00f2fe';
                            
                            setTimeout(() => {
                                rect.style.fill = '#4facfe';
                            }, 500);
                        }, 3500 + index * 700);
                        
                        this.animationIntervals.set(`vertical-bar-${index}`, [interval]);
                        
                        setTimeout(() => {
                            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                            text.setAttribute('x', parseFloat(rect.getAttribute('x')) + parseFloat(rect.getAttribute('width'))/2);
                            text.setAttribute('y', parseFloat(y) - 5);
                            text.setAttribute('text-anchor', 'middle');
                            text.setAttribute('fill', '#4facfe');
                            text.setAttribute('font-size', '10');
                            text.textContent = rect.getAttribute('data-height') / (chartHeight / maxValue);
                            text.style.opacity = '0';
                            
                            rect.parentNode.appendChild(text);
                            
                            setTimeout(() => {
                                text.style.transition = 'opacity 0.3s ease-out';
                                text.style.opacity = '1';
                            }, 100);
                        }, 800);
                    }, index * 200);
                });
            }, 100);
        }
        
        this.setupContainerAnimationControl(container);
    }

    renderCategoryPieChart(container, data) {
        const total = data.reduce((sum, item) => sum + item.count, 0);
        const colors = ['#4facfe', '#00f2fe', '#667eea', '#764ba2', '#f093fb', '#f5576c', '#43e97b', '#38f9d7'];
        
        let cumulativePercentage = 0;
        let paths = [];
        
        data.forEach((item, index) => {
            const percentage = total > 0 ? (item.count / total) : 0;
            if (percentage === 0) return;
            
            const angle = percentage * 360;
            const largeArcFlag = angle > 180 ? 1 : 0;
            
            const startAngle = cumulativePercentage;
            const endAngle = startAngle + angle;
            
            const startRad = (startAngle - 90) * Math.PI / 180;
            const endRad = (endAngle - 90) * Math.PI / 180;
            
            const x1 = 50 + 50 * Math.cos(startRad);
            const y1 = 50 + 50 * Math.sin(startRad);
            const x2 = 50 + 50 * Math.cos(endRad);
            const y2 = 50 + 50 * Math.sin(endRad);
            
            const pathData = [
                `M 50 50`,
                `L ${x1} ${y1}`,
                `A 50 50 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                'Z'
            ].join(' ');
            
            paths.push(`<path d="${pathData}" fill="${colors[index % colors.length]}" stroke="rgba(255,255,255,0.1)" stroke-width="0.5" class="pie-segment" />`);
            cumulativePercentage += angle;
        });
        
        let labelsHtml = '';
        data.forEach((item, index) => {
            const percentage = total > 0 ? (item.count / total) : 0;
            if (percentage === 0) return;
            
            const percentText = (percentage * 100).toFixed(1);
            labelsHtml += `
                <div class="pie-label-item">
                    <div class="pie-label-color" style="background: ${colors[index % colors.length]}"></div>
                    <div class="pie-label-content">
                        <div class="pie-label-name">${item.category}</div>
                        <div class="pie-label-value">${item.count}家 (${percentText}%)</div>
                    </div>
                </div>
            `;
        });
        
        const html = `
            <div class="pie-chart-container">
                <div class="chart-title">分类分布</div>
                <div class="pie-svg-container">
                    <svg viewBox="0 0 100 100" class="pie-svg">
                        ${paths.join('')}
                    </svg>
                </div>
                <div class="pie-labels-container">
                    <div class="pie-labels-list">
                        ${labelsHtml}
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        
        if (this.animationsEnabled) {
            this.animatePieChart(container);
        }
        
        this.setupContainerAnimationControl(container);
    }

    renderTimeTrendChart() {
        const container = document.getElementById('timeTrendChart');
        if (!container) return;

        const period = this.chartConfigs.timeTrend.period;
        const platformData = this.data.time_trend_by_platform;
        
        let data = [];
        let periodLabel = '';
        
        switch (period) {
            case 'three_days':
                data = platformData.threeDays || [];
                periodLabel = '近三天';
                break;
            case 'one_week':
                data = platformData.oneWeek || [];
                periodLabel = '近一周';
                break;
            case 'one_month':
                data = platformData.oneMonth || [];
                periodLabel = '近一月';
                break;
            case 'three_months':
                data = platformData.threeMonths || [];
                periodLabel = '近三月';
                break;
        }

        if (!data || data.length === 0) {
            container.innerHTML = `<div class="no-data">${periodLabel}暂无平台数据</div>`;
            return;
        }

        const maxValue = Math.max(...data.map(item => item.count));
        
        let html = `<div class="trend-comparison"><h4 style="font-size: 10px; margin-bottom: 8px; color: #4facfe;">${periodLabel}各平台新增</h4>`;
        
        data.forEach((item, index) => {
            const percentage = maxValue > 0 ? (item.count / maxValue) * 100 : 0;
            html += `
                <div class="trend-item">
                    <div class="trend-label">${item.platform}</div>
                    <div class="trend-bar-container">
                        <div class="trend-bar-fill" style="width: 0%" data-width="${percentage}">
                            <span class="trend-value">${item.count}家</span>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
        
        if (this.animationsEnabled) {
            setTimeout(() => {
                container.querySelectorAll('.trend-bar-fill').forEach((bar, index) => {
                    const width = bar.getAttribute('data-width');
                    setTimeout(() => {
                        bar.style.width = `${width}%`;
                    }, index * 150);
                });
            }, 100);
        }

        this.animateBars(container, '.trend-bar-fill');
        this.setupContainerAnimationControl(container);
    }

    startAutoRefresh() {
        setInterval(() => {
            this.loadData();
        }, 5 * 60 * 1000);
    }

    showLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'flex';
    }

    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    showError(message) {
        this.showMessage(message, '#f5576c');
    }

    showMessage(message, color) {
        const existingMessage = document.querySelector('.error-message');
        if (existingMessage) existingMessage.remove();

        const messageDiv = document.createElement('div');
        messageDiv.className = 'error-message';
        messageDiv.style.background = color;
        messageDiv.textContent = message;
        document.body.appendChild(messageDiv);

        setTimeout(() => {
            messageDiv.remove();
        }, 3000);
    }
}

// 初始化驾驶舱
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});