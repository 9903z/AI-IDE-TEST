/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Send, 
  Loader2, 
  Image as ImageIcon, 
  Copy, 
  Check, 
  Smartphone, 
  Share2, 
  Zap,
  LayoutGrid,
  Type,
  X,
  RefreshCw,
  Heart,
  MessageCircle,
  Bookmark,
  MoreHorizontal,
  User
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// API Proxy for China intranet support
const INTERNAL_PROXY = `${window.location.origin}/api/proxy/gemini`;
const GEMINI_PROXY_URL = import.meta.env.VITE_GEMINI_PROXY_URL || INTERNAL_PROXY;
const PROXY_HEADER_NAME = import.meta.env.VITE_GEMINI_PROXY_HEADER_NAME;
const PROXY_HEADER_VALUE = import.meta.env.VITE_GEMINI_PROXY_HEADER_VALUE;

if (GEMINI_PROXY_URL) {
  const originalFetch = window.fetch.bind(window);
  try {
    Object.defineProperty(window, 'fetch', {
      value: async (...args: any[]) => {
        let [resource, config] = args;
        
        if (typeof resource === 'string' && resource.includes('generativelanguage.googleapis.com')) {
          // Replace base URL
          const proxyBase = GEMINI_PROXY_URL.replace(/\/$/, '');
          resource = resource.replace('https://generativelanguage.googleapis.com', proxyBase);
          
          // Inject custom headers if provided
          if (PROXY_HEADER_NAME && PROXY_HEADER_VALUE) {
            config = config || {};
            config.headers = {
              ...config.headers,
              [PROXY_HEADER_NAME]: PROXY_HEADER_VALUE
            };
          }
        }
        
        return originalFetch(resource, config);
      },
      configurable: true,
      writable: true
    });
  } catch (e) {
    console.warn('无法直接覆盖 window.fetch，尝试备选方案...', e);
    // 如果 defineProperty 也失败，通常是因为环境极其严格
  }
}

// Initialize Gemini AI
// (Moved inside generateContent to follow SDK best practices)

type Platform = 'Xiaohongshu' | 'Bilibili' | 'Douyin' | 'WeChat' | 'Kuaishou' | 'Weibo' | 'Autohome' | 'Dongchedi' | 'Yiche';

interface PlatformContent {
  platform: Platform;
  title: string;
  content: string;
  tags: string[];
  imagePrompt: string;
  imageUrl?: string;
}

const PLATFORMS: { id: Platform; name: string; color: string; icon: string }[] = [
  { 
    id: 'Xiaohongshu', 
    name: '小红书', 
    color: 'bg-red-500', 
    icon: 'https://files.codelife.cc/website/xiaohongshu.svg' 
  },
  { 
    id: 'Bilibili', 
    name: 'B站', 
    color: 'bg-pink-400', 
    icon: 'https://files.codelife.cc/website/bilibili.svg' 
  },
  { 
    id: 'Douyin', 
    name: '抖音', 
    color: 'bg-black', 
    icon: 'https://files.codelife.cc/website/douyin.svg' 
  },
  { 
    id: 'WeChat', 
    name: '朋友圈', 
    color: 'bg-green-500', 
    icon: 'https://img.icons8.com/color/96/weixing.png' 
  },
  { 
    id: 'Kuaishou', 
    name: '快手', 
    color: 'bg-orange-500', 
    icon: 'https://files.codelife.cc/website/kuaishou.svg' 
  },
  { 
    id: 'Weibo', 
    name: '微博', 
    color: 'bg-red-600', 
    icon: 'https://files.codelife.cc/website/weibo.svg' 
  },
  { 
    id: 'Autohome', 
    name: '汽车之家', 
    color: 'bg-blue-600', 
    icon: 'https://files.codelife.cc/website/autohome.svg' 
  },
  { 
    id: 'Dongchedi', 
    name: '懂车帝', 
    color: 'bg-yellow-400', 
    icon: 'https://img.icons8.com/color/96/car.png' 
  },
  { 
    id: 'Yiche', 
    name: '易车', 
    color: 'bg-blue-500', 
    icon: 'https://img.icons8.com/color/96/steering-wheel.png' 
  },
];

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PlatformContent[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [previewItem, setPreviewItem] = useState<PlatformContent | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(PLATFORMS.map(p => p.id));
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [proxyStatus, setProxyStatus] = useState<'testing' | 'ok' | 'error'>('testing');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const testProxy = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) setProxyStatus('ok');
        else setProxyStatus('error');
      } catch (e) {
        setProxyStatus('error');
      }
    };
    testProxy();
  }, []);

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const generateImageWithRetry = async (item: PlatformContent, index: number, retries = 2): Promise<string | null> => {
    try {
      const imageAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      const imgParts: any[] = [{ text: item.imagePrompt }];
      
      if (referenceImage) {
        const mimeType = referenceImage.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
        imgParts.push({
          inlineData: {
            mimeType: mimeType,
            data: referenceImage.split(',')[1]
          }
        });
      }

      const imgResult = await imageAi.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [{ parts: imgParts }],
        config: {
          imageConfig: {
            aspectRatio: (item.platform === 'Douyin' || item.platform === 'Kuaishou') ? "9:16" : "3:4",
          }
        }
      });

      const imagePart = imgResult.candidates?.[0]?.content?.parts.find(p => p.inlineData);
      if (imagePart?.inlineData) {
        return `data:image/png;base64,${imagePart.inlineData.data}`;
      }
      return null;
    } catch (err: any) {
      if (err?.status === "RESOURCE_EXHAUSTED" || err?.message?.includes("429") || err?.message?.includes("quota")) {
        if (retries > 0) {
          await delay(2000 * (3 - retries)); // Exponential backoff
          return generateImageWithRetry(item, index, retries - 1);
        }
      }
      console.error(`Failed to generate image for ${item.platform}:`, err);
      return null;
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setReferenceImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeReferenceImage = () => {
    setReferenceImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const togglePlatform = (id: Platform) => {
    setSelectedPlatforms(prev => 
      prev.includes(id) 
        ? prev.filter(p => p !== id) 
        : [...prev, id]
    );
  };

  const selectAll = () => setSelectedPlatforms(PLATFORMS.map(p => p.id));
  const deselectAll = () => setSelectedPlatforms([]);

  const generateContent = async () => {
    if (!prompt.trim() || selectedPlatforms.length === 0) return;
    setLoading(true);
    setResults([]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      
      const selectedNames = PLATFORMS.filter(p => selectedPlatforms.includes(p.id)).map(p => p.name).join('、');
      const systemInstruction = `
        你是一个全能社交媒体运营专家。根据用户提供的主题${referenceImage ? '和参考图' : ''}，生成适配以下平台的文案和生图提示词：${selectedNames}。
        输出格式必须为 JSON 数组，包含以下字段：
        - platform: (必须仅限这几个值: ${selectedPlatforms.join(', ')})
        - title: 吸引人的标题
        - content: 正文内容。
          - 小红书：多用 Emoji，语气亲切，分段清晰。
          - B站：中二、玩梗、硬核或充满社区感。
          - 抖音/快手：短小精悍，爆点在前，适合口播。
          - 朋友圈：生活化，有共鸣，不生硬。
          - 微博：时效性强，带话题，适合传播。
          - 汽车之家/懂车帝/易车：专业、客观、详实，侧重汽车参数、体验和导购建议。
        - tags: 标签数组
        - imagePrompt: 专门用于 AI 生图的英文提示词，要体现该平台的视觉风格。${referenceImage ? '请参考用户提供的图片风格和元素。' : ''}
      `;

      const parts: any[] = [{ text: `主题：${prompt}` }];
      if (referenceImage) {
        const mimeType = referenceImage.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
        parts.push({
          inlineData: {
            mimeType: mimeType,
            data: referenceImage.split(',')[1]
          }
        });
      }

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
        }
      });

      const parsedResults: PlatformContent[] = JSON.parse(result.text || "[]");
      setResults(parsedResults);
      setImageErrors({});

      // Process images sequentially with a small delay to avoid 429 errors
      for (let i = 0; i < parsedResults.length; i++) {
        const item = parsedResults[i];
        const url = await generateImageWithRetry(item, i);
        
        if (url) {
          setResults(prev => {
            const newResults = [...prev];
            newResults[i] = { ...newResults[i], imageUrl: url };
            return newResults;
          });
        } else {
          setImageErrors(prev => ({ ...prev, [item.platform]: true }));
        }
        
        // Add a small delay between requests even if successful
        if (i < parsedResults.length - 1) await delay(1000);
      }
    } catch (error) {
      console.error("Generation error:", error);
      alert("生成失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handlePublish = (platform: string) => {
    console.log(`正在模拟发布到 ${platform}...`);
    setPreviewItem(null);
  };

  const regeneratePlatformContent = async (platformId: Platform, type: 'text' | 'image' | 'both') => {
    const index = results.findIndex(r => r.platform === platformId);
    if (index === -1) return;

    // Update state to show loading
    setResults(prev => {
      const newResults = [...prev];
      if (type === 'text' || type === 'both') {
        newResults[index] = { ...newResults[index], title: '重新生成中...', content: '正在为您重新构思文案...', tags: [] };
      }
      if (type === 'image' || type === 'both') {
        newResults[index] = { ...newResults[index], imageUrl: undefined };
        setImageErrors(prevErrors => ({ ...prevErrors, [platformId]: false }));
      }
      return newResults;
    });

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      const platformName = PLATFORMS.find(p => p.id === platformId)?.name;
      
      let updatedItem = { ...results[index] };

      if (type === 'text' || type === 'both') {
        const systemInstruction = `
          你是一个全能社交媒体运营专家。根据用户提供的主题${referenceImage ? '和参考图' : ''}，为【${platformName}】生成一份全新的文案和生图提示词。
          输出格式必须为 JSON 对象，包含以下字段：
          - platform: "${platformId}"
          - title: 吸引人的标题
          - content: 正文内容。
            - 小红书：多用 Emoji，语气亲切，分段清晰。
            - B站：中二、玩梗、硬核或充满社区感。
            - 抖音/快手：短小精悍，爆点在前，适合口播。
            - 朋友圈：生活化，有共鸣，不生硬。
            - 微博：时效性强，带话题，适合传播。
            - 汽车之家/懂车帝/易车：专业、客观、详实，侧重汽车参数、体验和导购建议。
          - tags: 标签数组
          - imagePrompt: 专门用于 AI 生图的英文提示词，要体现该平台的视觉风格。${referenceImage ? '请参考用户提供的图片风格和元素。' : ''}
        `;

        const parts: any[] = [{ text: `主题：${prompt}` }];
        if (referenceImage) {
          const mimeType = referenceImage.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
          parts.push({
            inlineData: {
              mimeType: mimeType,
              data: referenceImage.split(',')[1]
            }
          });
        }

        const result = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [{ role: "user", parts }],
          config: {
            systemInstruction,
            responseMimeType: "application/json",
          }
        });

        const newItem = JSON.parse(result.text || "{}");
        updatedItem = { ...updatedItem, ...newItem };
        
        setResults(prev => {
          const newResults = [...prev];
          newResults[index] = updatedItem;
          return newResults;
        });
      }

      if (type === 'image' || type === 'both') {
        const url = await generateImageWithRetry(updatedItem, index);
        if (url) {
          setResults(prev => {
            const newResults = [...prev];
            newResults[index] = { ...newResults[index], imageUrl: url };
            return newResults;
          });
        } else {
          setImageErrors(prev => ({ ...prev, [platformId]: true }));
        }
      }
    } catch (error) {
      console.error("Regeneration error:", error);
      alert("重新生成失败，请稍后重试。");
    }
  };

  return (
    <div className="min-h-screen font-sans selection:bg-indigo-500/30 text-slate-200 relative">
      {/* Background Effects */}
      <div className="ripple-container">
        <div className="ripple" style={{ width: '400px', height: '400px', left: '10%', top: '10%' }}></div>
        <div className="ripple" style={{ width: '600px', height: '600px', left: '60%', top: '40%' }}></div>
        <div className="ripple" style={{ width: '500px', height: '500px', left: '30%', top: '70%' }}></div>
        <div className="ripple" style={{ width: '450px', height: '450px', left: '80%', top: '15%' }}></div>
      </div>
      <div className="fixed inset-0 bg-grid-pattern opacity-20 pointer-events-none z-[-1]"></div>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-950/50 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Zap className="text-white w-6 h-6 fill-current" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-violet-400">
              AI 多平台创作助手
            </h1>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-sm font-medium text-slate-400">
            <span className="flex items-center gap-1"><Smartphone size={16} /> 移动端适配</span>
            <span className="flex items-center gap-1"><LayoutGrid size={16} /> 多平台同步</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 relative z-10">
        {/* Input Section */}
        <section className="max-w-4xl mx-auto mb-12">
          <div className="glass-card p-8 rounded-[40px] shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2 text-slate-100 font-bold text-lg">
                <Type size={24} className="text-indigo-400" />
                创作灵感
              </div>
              <div className="flex items-center gap-3">
                <button onClick={selectAll} className="text-xs text-indigo-400 hover:underline">全选</button>
                <div className="w-px h-3 bg-white/10" />
                <button onClick={deselectAll} className="text-xs text-slate-500 hover:underline">清空</button>
              </div>
            </div>
            
            <div className="relative mb-8 group">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例如：分享一个关于春季露营的体验，包含装备推荐和心情感悟..."
                className="w-full h-48 p-6 bg-white/5 border border-white/10 rounded-3xl focus:ring-2 focus:ring-indigo-500/20 resize-none text-slate-200 placeholder:text-slate-500 transition-all text-lg leading-relaxed outline-none"
              />
              
              {/* Reference Image Slot */}
              <div className="absolute left-6 bottom-6 flex items-center gap-3">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
                
                {referenceImage ? (
                  <div className="relative group/img">
                    <img 
                      src={referenceImage} 
                      alt="Reference" 
                      className="w-16 h-16 rounded-xl object-cover border-2 border-indigo-500 shadow-md" 
                    />
                    <button 
                      onClick={removeReferenceImage}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg opacity-0 group-hover/img:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-16 h-16 rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center text-slate-500 hover:border-indigo-400 hover:text-indigo-400 transition-all bg-white/5 backdrop-blur-sm"
                  >
                    <ImageIcon size={20} />
                    <span className="text-[10px] mt-1 font-bold">参考图</span>
                  </button>
                )}
              </div>

              <button
                onClick={generateContent}
                disabled={loading || !prompt.trim() || selectedPlatforms.length === 0}
                className="absolute bottom-6 right-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-800 disabled:text-slate-500 text-white px-8 py-3 rounded-2xl font-bold shadow-xl shadow-indigo-500/20 flex items-center gap-2 transition-all active:scale-95 z-10"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                {loading ? '正在创作...' : '立即生成'}
              </button>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {PLATFORMS.map(p => {
                const isSelected = selectedPlatforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition-all cursor-pointer border shadow-sm active:scale-95 ${
                      isSelected 
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400 ring-1 ring-indigo-500/20' 
                        : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:bg-white/10'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md overflow-hidden flex items-center justify-center transition-all ${isSelected ? 'scale-110' : 'grayscale opacity-60'}`}>
                      <img 
                        src={p.icon} 
                        alt={p.name} 
                        className="w-full h-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    {p.name}
                    {isSelected && (
                      <div className="bg-indigo-600 rounded-full p-0.5">
                        <Check size={10} className="text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {selectedPlatforms.length === 0 && (
              <p className="mt-4 text-center text-xs text-red-400 font-medium">请至少选择一个发布平台以开始创作</p>
            )}
          </div>
        </section>

        {/* Results Section */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <AnimatePresence mode="popLayout">
            {results.map((item, index) => (
              <motion.div
                key={item.platform}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="glass-card rounded-[32px] overflow-hidden shadow-2xl flex flex-col border border-white/10"
              >
                {/* Platform Header */}
                <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center border border-white/10">
                      <img 
                        src={PLATFORMS.find(p => p.id === item.platform)?.icon} 
                        alt={item.platform} 
                        className="w-6 h-6 object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <span className="font-bold text-slate-100">
                      {PLATFORMS.find(p => p.id === item.platform)?.name}
                    </span>
                  </div>
                  <button 
                    onClick={() => copyToClipboard(`${item.title}\n\n${item.content}\n\n${item.tags.join(' ')}`, index)}
                    className="text-slate-400 hover:text-indigo-400 transition-colors p-2 hover:bg-white/10 rounded-lg"
                  >
                    {copiedIndex === index ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
                  </button>
                </div>

                <div className="p-6 flex flex-col lg:flex-row gap-6">
                  {/* Image Preview */}
                  <div className="w-full lg:w-2/5 shrink-0">
                    <div className="aspect-[3/4] bg-white/5 rounded-2xl overflow-hidden relative group border border-white/10">
                      {item.imageUrl ? (
                        <img 
                          src={item.imageUrl} 
                          alt={item.platform} 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : imageErrors[item.platform] ? (
                        <div className="w-full h-full flex flex-col items-center justify-center text-red-400 p-4 text-center gap-3 bg-red-500/10">
                          <Zap size={24} className="opacity-50" />
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold">生成额度已耗尽</p>
                            <p className="text-[8px] opacity-70">Gemini 免费额度有限，请稍后重试</p>
                          </div>
                          <button 
                            onClick={() => regeneratePlatformContent(item.platform, 'image')}
                            className="bg-white/10 border border-red-500/30 text-red-400 px-3 py-1 rounded-lg text-[10px] font-bold hover:bg-red-500/20 transition-colors"
                          >
                            重试绘图
                          </button>
                        </div>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                          <Loader2 className="animate-spin" size={24} />
                          <span className="text-xs">AI 绘图中...</span>
                        </div>
                      )}
                      {item.imageUrl && (
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button 
                            onClick={() => setPreviewItem(item)}
                            className="bg-white/10 backdrop-blur-md text-white px-4 py-2 rounded-full text-xs font-medium flex items-center gap-2 border border-white/20 hover:bg-white/20 transition-all"
                          >
                            <ImageIcon size={14} /> 预览
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Text Content */}
                  <div className="flex-1 space-y-4">
                    <h3 className="text-lg font-bold text-slate-100 leading-tight">
                      {item.title}
                    </h3>
                    <div className="text-slate-400 text-sm leading-relaxed whitespace-pre-wrap">
                      {item.content}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                      {item.tags.map(tag => (
                        <span key={tag} className="text-indigo-400 text-xs font-medium bg-indigo-500/10 px-2 py-0.5 rounded-md">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="px-6 py-4 bg-white/5 border-t border-white/10 mt-auto flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => regeneratePlatformContent(item.platform, 'text')}
                      className="text-[10px] font-bold text-slate-400 hover:text-indigo-400 flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-white/10 transition-all"
                    >
                      <RefreshCw size={12} /> 新文案
                    </button>
                    <button 
                      onClick={() => regeneratePlatformContent(item.platform, 'image')}
                      className="text-[10px] font-bold text-slate-400 hover:text-indigo-400 flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-white/10 transition-all"
                    >
                      <RefreshCw size={12} /> 新图片
                    </button>
                    <button 
                      onClick={() => regeneratePlatformContent(item.platform, 'both')}
                      className="text-[10px] font-bold text-slate-400 hover:text-indigo-400 flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-white/10 transition-all"
                    >
                      <RefreshCw size={12} /> 新图文
                    </button>
                  </div>
                  <button 
                    onClick={() => setPreviewItem(item)}
                    className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 active:scale-95"
                  >
                    <Share2 size={16} /> 立即发布
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {results.length === 0 && !loading && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-500 glass-card rounded-[40px] border border-white/10">
              <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/10">
                <LayoutGrid size={32} className="text-indigo-400 opacity-50" />
              </div>
              <p className="text-lg font-medium text-slate-100">输入主题，开启全平台创作之旅</p>
              <p className="text-sm text-slate-400">AI 将为你自动适配文案风格与配图</p>
            </div>
          )}
        </section>

        {/* Gallery Section */}
        {results.length > 0 && (
          <motion.section 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-20 pt-12 border-t border-white/10"
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                <ImageIcon className="text-indigo-400" /> 生成图片总览
              </h2>
              <p className="text-sm text-slate-400">点击图片预览发布效果</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {results.map((item) => (
                <div key={`gallery-${item.platform}`} className="group space-y-3">
                  <div 
                    onClick={() => setPreviewItem(item)}
                    className="aspect-square rounded-3xl overflow-hidden bg-white/5 border border-white/10 relative shadow-sm transition-all hover:shadow-2xl hover:-translate-y-1 cursor-pointer group glass-card"
                  >
                    {item.imageUrl ? (
                      <img 
                        src={item.imageUrl} 
                        alt={item.platform} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                        <Loader2 className="animate-spin" size={20} />
                        <span className="text-[10px]">生成中</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-xs font-bold bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/20">预览</span>
                    </div>
                    <div className="absolute top-3 left-3">
                      <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-2 py-1 rounded-lg shadow-sm border border-white/10">
                        <img 
                          src={PLATFORMS.find(p => p.id === item.platform)?.icon} 
                          alt={item.platform} 
                          className="w-3 h-3 object-contain"
                          referrerPolicy="no-referrer"
                        />
                        <span className="text-[10px] font-bold text-slate-100">
                          {PLATFORMS.find(p => p.id === item.platform)?.name}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        )}
      </main>

      {/* Preview Modal */}
      <AnimatePresence>
        {previewItem && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewItem(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 sticky top-0 bg-white z-10">
                <div className="flex items-center gap-3">
                  <img 
                    src={PLATFORMS.find(p => p.id === previewItem.platform)?.icon} 
                    alt={previewItem.platform} 
                    className="w-6 h-6 object-contain"
                    referrerPolicy="no-referrer"
                  />
                  <span className="text-sm font-bold text-slate-800">发布预览：{PLATFORMS.find(p => p.id === previewItem.platform)?.name}</span>
                </div>
                <button 
                  onClick={() => setPreviewItem(null)}
                  className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Mockup Content */}
              <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
                <div className="max-w-[375px] mx-auto bg-white rounded-[32px] shadow-xl border border-slate-200 overflow-hidden relative">
                  {/* Platform Specific Mockups */}
                  {previewItem.platform === 'Xiaohongshu' && (
                    <div className="flex flex-col">
                      <img src={previewItem.imageUrl} className="w-full aspect-[3/4] object-cover" referrerPolicy="no-referrer" />
                      <div className="p-4 space-y-3">
                        <h4 className="font-bold text-lg">{previewItem.title}</h4>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{previewItem.content}</p>
                        <div className="flex flex-wrap gap-1">
                          {previewItem.tags.map(t => <span key={t} className="text-blue-600 text-sm">#{t}</span>)}
                        </div>
                        <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                          <div className="flex items-center gap-4 text-slate-400">
                            <Heart size={20} />
                            <MessageCircle size={20} />
                            <Bookmark size={20} />
                          </div>
                          <Share2 size={20} className="text-slate-400" />
                        </div>
                      </div>
                    </div>
                  )}

                  {previewItem.platform === 'Douyin' && (
                    <div className="relative aspect-[9/16] bg-black">
                      <img src={previewItem.imageUrl} className="w-full h-full object-cover opacity-80" referrerPolicy="no-referrer" />
                      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent text-white space-y-2">
                        <h4 className="font-bold">@AI创作助手</h4>
                        <p className="text-sm line-clamp-2">{previewItem.content}</p>
                        <div className="flex gap-2 text-xs opacity-80">
                          {previewItem.tags.map(t => <span key={t}>#{t}</span>)}
                        </div>
                      </div>
                      <div className="absolute right-4 bottom-24 flex flex-col items-center gap-6 text-white">
                        <div className="flex flex-col items-center gap-1"><div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md"><Heart fill="white" size={24} /></div><span className="text-xs">99w</span></div>
                        <div className="flex flex-col items-center gap-1"><div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md"><MessageCircle fill="white" size={24} /></div><span className="text-xs">1.2w</span></div>
                        <div className="flex flex-col items-center gap-1"><div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md"><Bookmark fill="white" size={24} /></div><span className="text-xs">5k</span></div>
                        <div className="flex flex-col items-center gap-1"><div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md"><Share2 fill="white" size={24} /></div><span className="text-xs">分享</span></div>
                      </div>
                    </div>
                  )}

                  {previewItem.platform === 'Bilibili' && (
                    <div className="flex flex-col">
                      <div className="relative aspect-video bg-slate-900">
                        <img src={previewItem.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 text-white text-[10px] rounded">10:24</div>
                      </div>
                      <div className="p-4 space-y-2">
                        <h4 className="font-bold text-base line-clamp-2">{previewItem.title}</h4>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span>AI创作助手</span>
                          <span>•</span>
                          <span>10.5万次观看</span>
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-3 bg-slate-50 p-2 rounded-lg">{previewItem.content}</p>
                      </div>
                    </div>
                  )}

                  {previewItem.platform === 'WeChat' && (
                    <div className="p-4 space-y-4">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 bg-slate-200 rounded-lg shrink-0 flex items-center justify-center text-slate-400"><User size={24} /></div>
                        <div className="flex-1 space-y-3">
                          <h4 className="font-bold text-indigo-600 text-sm">AI创作助手</h4>
                          <p className="text-sm text-slate-800">{previewItem.content}</p>
                          <div className="grid grid-cols-1 gap-2">
                            <img src={previewItem.imageUrl} className="w-2/3 rounded-lg border border-slate-100" referrerPolicy="no-referrer" />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span>10分钟前</span>
                            <div className="bg-slate-100 p-1 rounded"><MoreHorizontal size={14} /></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {previewItem.platform === 'Weibo' && (
                    <div className="p-4 space-y-4">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 bg-slate-200 rounded-full shrink-0 flex items-center justify-center text-slate-400"><User size={24} /></div>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-orange-600 text-sm">AI创作助手</h4>
                            <span className="text-xs text-slate-400">关注</span>
                          </div>
                          <p className="text-sm text-slate-800">{previewItem.content}</p>
                          <div className="grid grid-cols-1 gap-2">
                            <img src={previewItem.imageUrl} className="w-full rounded-lg" referrerPolicy="no-referrer" />
                          </div>
                          <div className="flex items-center justify-between pt-2 text-slate-400">
                            <div className="flex items-center gap-6">
                              <Share2 size={16} />
                              <MessageCircle size={16} />
                              <Heart size={16} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {previewItem.platform === 'Kuaishou' && (
                    <div className="relative aspect-[9/16] bg-black">
                      <img src={previewItem.imageUrl} className="w-full h-full object-cover opacity-80" referrerPolicy="no-referrer" />
                      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent text-white space-y-2">
                        <h4 className="font-bold">@AI创作助手</h4>
                        <p className="text-sm line-clamp-2">{previewItem.content}</p>
                        <div className="flex gap-2 text-xs opacity-80">
                          {previewItem.tags.map(t => <span key={t}>#{t}</span>)}
                        </div>
                      </div>
                      <div className="absolute right-4 bottom-24 flex flex-col items-center gap-6 text-white">
                        <div className="flex flex-col items-center gap-1"><div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center shadow-lg"><Heart fill="white" size={24} /></div><span className="text-xs">赞</span></div>
                        <div className="flex flex-col items-center gap-1"><div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md"><MessageCircle fill="white" size={24} /></div><span className="text-xs">评</span></div>
                        <div className="flex flex-col items-center gap-1"><div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md"><Share2 fill="white" size={24} /></div><span className="text-xs">转</span></div>
                      </div>
                    </div>
                  )}

                  {(previewItem.platform === 'Autohome' || previewItem.platform === 'Dongchedi' || previewItem.platform === 'Yiche') && (
                    <div className="flex flex-col">
                      <div className="relative aspect-video">
                        <img src={previewItem.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <div className="absolute top-4 left-4 bg-blue-600 text-white px-2 py-1 rounded text-[10px] font-bold">专业评测</div>
                      </div>
                      <div className="p-5 space-y-4">
                        <h4 className="font-bold text-xl leading-tight text-slate-900">{previewItem.title}</h4>
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          <div className="w-6 h-6 bg-slate-200 rounded-full" />
                          <span>汽车频道官方</span>
                          <span>•</span>
                          <span>2026-03-15</span>
                        </div>
                        <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed">
                          {previewItem.content.split('\n').map((p, i) => <p key={i} className="mb-2">{p}</p>)}
                        </div>
                        <div className="flex items-center gap-4 pt-4 border-t border-slate-100">
                          <div className="flex items-center gap-1 text-slate-400"><Heart size={18} /> <span className="text-xs">1.2k</span></div>
                          <div className="flex items-center gap-1 text-slate-400"><MessageCircle size={18} /> <span className="text-xs">456</span></div>
                          <div className="flex items-center gap-1 text-slate-400"><Bookmark size={18} /> <span className="text-xs">收藏</span></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-slate-100 bg-white sticky bottom-0">
                <button 
                  onClick={() => handlePublish(PLATFORMS.find(p => p.id === previewItem.platform)?.name || "")}
                  className={`w-full py-4 rounded-2xl text-white font-bold shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95 ${PLATFORMS.find(p => p.id === previewItem.platform)?.color}`}
                >
                  <Share2 size={20} /> 立即发布到 {PLATFORMS.find(p => p.id === previewItem.platform)?.name}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-12 border-t border-slate-200 mt-20">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-slate-400 text-sm">
          <div className="flex items-center gap-4">
            <p>© 2026 AI 多平台创作助手. Powered by Gemini AI.</p>
            <div className="flex items-center gap-2 px-2 py-1 bg-slate-100 rounded-full text-[10px]">
              <div className={`w-2 h-2 rounded-full ${proxyStatus === 'ok' ? 'bg-emerald-500' : proxyStatus === 'error' ? 'bg-red-500' : 'bg-amber-500 animate-pulse'}`} />
              <span>网络代理: {proxyStatus === 'ok' ? '已连接' : proxyStatus === 'error' ? '连接失败' : '检测中...'}</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-indigo-600 transition-colors">使用条款</a>
            <a href="#" className="hover:text-indigo-600 transition-colors">隐私政策</a>
            <a href="#" className="hover:text-indigo-600 transition-colors">联系我们</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
