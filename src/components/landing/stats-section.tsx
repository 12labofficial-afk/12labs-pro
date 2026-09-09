'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Users, TrendingUp, Zap, Globe2 } from 'lucide-react';

interface StatItem {
  label: string;
  value: string;
  icon: React.ReactNode;
  description: string;
  gradient: string;
}

const stats: StatItem[] = [
  {
    label: 'Active Creators',
    value: '50K+',
    icon: <Users className="w-8 h-8" />,
    description: 'creators trust 12Labs daily',
    gradient: 'from-blue-500 to-cyan-500',
  },
  {
    label: 'Content Generated',
    value: '2M+',
    icon: <TrendingUp className="w-8 h-8" />,
    description: 'pieces of AI content created',
    gradient: 'from-purple-500 to-pink-500',
  },
  {
    label: 'Processing Power',
    value: '99.9%',
    icon: <Zap className="w-8 h-8" />,
    description: 'uptime guarantee always on',
    gradient: 'from-amber-500 to-orange-500',
  },
  {
    label: 'Global Reach',
    value: '150+',
    icon: <Globe2 className="w-8 h-8" />,
    description: 'countries using 12Labs',
    gradient: 'from-emerald-500 to-teal-500',
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.3,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 25,
    },
  },
};

export function StatsSection() {
  return (
    <section className="w-full py-16 md:py-24 bg-gradient-to-b from-transparent via-background/50 to-background relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="container px-4 md:px-6 mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-foreground font-headline mb-4">
            Trusted by <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-300 dark:to-purple-300 bg-clip-text text-transparent">Thousands</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Join creators worldwide who are transforming their content workflow
          </p>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto"
        >
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              variants={item}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="relative group"
            >
              {/* Animated background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-0 group-hover:opacity-10 rounded-2xl transition-opacity duration-500 blur-lg`} />

              {/* Card */}
              <div className="relative bg-card/60 dark:bg-zinc-950/60 backdrop-blur-xl border border-border/40 hover:border-border/80 rounded-2xl p-8 transition-all duration-300 shadow-sm hover:shadow-lg">
                {/* Icon */}
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 10 }}
                  className={`w-16 h-16 rounded-xl bg-gradient-to-br ${stat.gradient} bg-clip-border p-0.5 mb-6 flex items-center justify-center text-white shadow-lg`}
                >
                  <div className="w-full h-full rounded-[10px] bg-card/90 dark:bg-zinc-950/90 flex items-center justify-center text-foreground group-hover:opacity-0 transition-opacity duration-300">
                    <div className={`text-white bg-gradient-to-br ${stat.gradient} bg-clip-text text-transparent`}>
                      {stat.icon}
                    </div>
                  </div>
                </motion.div>

                {/* Content */}
                <div>
                  <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className={`text-4xl md:text-5xl font-black bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent mb-2`}
                  >
                    {stat.value}
                  </motion.div>
                  <h3 className="text-lg font-bold text-foreground mb-1">{stat.label}</h3>
                  <p className="text-sm text-muted-foreground">{stat.description}</p>
                </div>

                {/* Hover accent */}
                <div className={`absolute inset-x-0 -top-px h-px bg-gradient-to-r ${stat.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
