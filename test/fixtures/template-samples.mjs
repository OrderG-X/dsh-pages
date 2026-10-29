/** 每个模板一份像样的示例内容：测试和录演示都用它 */
export const SAMPLES = {
  report: {
    title: '第三季度复盘',
    data: {
      subtitle: '7–9 月 · 线上商城',
      summary: '收入比上季度涨了 **18%**，主要靠复购；退货率还偏高，下季度先抓尺码说明。',
      metrics: [
        { label: '收入', value: '¥382 万', delta: '+18%' },
        { label: '订单', value: '12,480', delta: '+9%' },
        { label: '退货率', value: '6.2%', delta: '+0.8%', good: 'down' },
      ],
      sections: [
        { heading: '做得好的', bullets: ['会员复购率 41%，比上季度高 7 个点', '直播间转化稳定在 3.5% 左右'] },
        { heading: '要改的', text: '退货里一半是「尺码不合适」。\n\n- 详情页加尺码对照表\n- 客服回复里带上身高体重建议' },
        { heading: '分渠道', table: { columns: ['渠道', '收入', '占比'], rows: [['小程序', '¥196 万', '51%'], ['直播', '¥121 万', '32%'], ['其他', '¥65 万', '17%']] } },
      ],
      sources: ['后台销售报表（10 月 3 日导出）'],
    },
  },
  compare: {
    title: '三款手机对比',
    data: {
      subtitle: '价格、屏幕、电池、相机、重量',
      items: [
        { name: 'iPhone 17', headline: '¥5,999', specs: { 屏幕: '6.3″ 120Hz', 电池: '3,700 mAh', 相机: '48MP ×2', 重量: '177 g', 系统: '升级 7 年' }, pros: ['系统流畅', '视频最好'], cons: ['电池偏小'] },
        { name: '小米 16', badge: '性价比', headline: '¥4,499', specs: { 屏幕: '6.36″ 120Hz', 电池: '6,000 mAh', 相机: '50MP ×3', 重量: '191 g', 系统: '升级 7 年' }, pros: ['续航最强', '价格最低'], cons: ['偏重'] },
        { name: '华为 Mate 80', headline: '¥5,499', specs: { 屏幕: '6.7″ 120Hz', 电池: '5,500 mAh', 相机: '50MP ×3', 重量: '217 g', 系统: '升级 7 年' }, pros: ['屏幕最大', '影像强'], cons: ['最重'] },
      ],
      best: { 电池: 'high', 重量: 'low' },
      recommend: '小米 16',
      verdict: '预算有限、看重续航选**小米 16**；拍视频多选 iPhone 17。',
    },
  },
  checklist: {
    title: '搬家清单',
    data: {
      subtitle: '10 月 26 日搬，按时间排',
      groups: [
        { title: '提前一周', items: ['约搬家公司', { text: '办宽带移机', note: '要带身份证，提前 3 天约', tag: '要预约' }, '买纸箱和胶带'] },
        { title: '前一天', items: ['冰箱断电除霜', '贵重物品单独装', '拍水电燃气表读数'] },
        { title: '当天', items: ['检查各个房间有没有落下', '交钥匙'] },
      ],
    },
  },
  dashboard: {
    title: '网站周报',
    data: {
      subtitle: '10 月 20 日 – 26 日',
      metrics: [
        { label: '访客', value: '48,230', delta: '+12%' },
        { label: '注册', value: '1,326', delta: '+4%' },
        { label: '跳出率', value: '38%', delta: '-3%', good: 'down' },
        { label: '平均停留', value: '2 分 41 秒' },
      ],
      charts: [
        { type: 'line', title: '每天访客', labels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'], series: [{ name: '访客', values: [6200, 6800, 7100, 6900, 7600, 6700, 6930] }] },
        { type: 'pie', title: '流量来源', labels: ['搜索', '直接访问', '社交', '外链'], series: [{ name: '访客', values: [21400, 12800, 9300, 4730] }] },
        { type: 'bar', title: '注册：新老页面', labels: ['周一', '周二', '周三', '周四', '周五'], series: [{ name: '老页面', values: [92, 101, 88, 95, 110] }, { name: '新页面', values: [118, 126, 121, 130, 142] }] },
      ],
    },
  },
  timeline: {
    title: 'App 2.0 上线计划',
    data: {
      events: [
        { time: '9 月 2 日', title: '需求定稿', status: 'done' },
        { time: '9 月 30 日', title: '开发完成', text: '登录、支付、消息三块全部提测', status: 'done' },
        { time: '10 月 28 日', title: '公测', text: '先放 10% 用户，盯崩溃率', status: 'now', tag: '本周' },
        { time: '11 月 11 日', title: '正式上线', status: 'todo' },
      ],
    },
  },
  flashcards: {
    title: '日语五十音：あ行和か行',
    data: {
      cards: [
        { front: 'あ', back: 'a', hint: '像「安」的草书' },
        { front: 'い', back: 'i' },
        { front: 'う', back: 'u' },
        { front: 'か', back: 'ka', hint: '来自「加」' },
        { front: 'き', back: 'ki' },
      ],
    },
  },
  quiz: {
    title: '太阳系小测验',
    data: {
      questions: [
        { question: '离太阳最近的行星是？', options: ['金星', '水星', '火星'], answer: 1, explain: '水星离太阳平均约 5800 万公里。' },
        { question: '太阳系最大的行星是？', options: ['土星', '木星', '海王星', '天王星'], answer: 1 },
        { question: '「红色星球」指的是？', options: ['火星', '金星'], answer: 0, explain: '火星表面的氧化铁让它看起来发红。' },
      ],
    },
  },
  flow: {
    title: '报销流程',
    data: {
      nodes: [
        { id: 'a', text: '提交报销单', kind: 'start' },
        { id: 'b', text: '金额超过 5000？', kind: 'decision' },
        { id: 'c', text: '部门经理审批' },
        { id: 'd', text: '财务总监审批', note: '2 个工作日内' },
        { id: 'e', text: '财务打款', kind: 'end' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c', label: '否' },
        { from: 'b', to: 'd', label: '是' },
        { from: 'c', to: 'e' },
        { from: 'd', to: 'e' },
      ],
    },
  },
}
