'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Upload, Wand2, Download, CheckCircle2 } from 'lucide-react';

interface Step {
  number: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const steps: Step[] = [
  {
    number: 1,
    title: 'Upload or Create',
    description: 'Start with your script, video, or idea. Our AI helps you create from scratch.',
    icon: <Upload className="w-8 h-8" />,
    color: 'from-blue-500 to-cyan-500',
  },
  {
    number: 2,
    title: 'Choose Your Voice',
    description: 'Pick from 500+ AI voices in 70+ languages or clone your own voice.',
    icon: <Wand2 className="w-8 h-8" />,
    color: 'from-purple-500 to-pink-500',
  },
  {
    number: 3,
    title: 'Auto-Enhance',
    description: 'AI automatically generates music, thumbnails, subtitles, and more.',
    icon: <CheckCircle2 className="w-8 h-8" />,
    color: 'from-emerald-500 to-teal-500',
  },
  {
    number: 4,
    title: 'Download & Share',
    description: 'Export in any format and publish across all your platforms instantly.',
    icon: <Download className="w-8 h-8" />,
    color: 'from-orange-500 to-red-500',
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 30 },
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

export function HowItWorksSection() {
  return (
    <section className="w-full py-16 md:py-24 bg-background relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/2 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/4 left-0 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="container px-4 md:px-6 mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-foreground font-headline mb-4">
            How It <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-300 dark:to-purple-300 bg-clip-text text-transparent">Works</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Create professional content in 4 simple steps. No technical skills needed.
          </p>
        </motion.div>

        {/* Steps Grid */}
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="max-w-6xl mx-auto"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, index) => (
              <motion.div
                key={step.number}
                variants={item}
                className="relative group"
              >
                {/* Connecting Line */}
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-1/3 left-[calc(100%+24px)] w-6 h-1 bg-gradient-to-r from-primary/50 to-transparent" />
                )}

                {/* Card */}
                <div className="relative h-full">
                  {/* Animated background gradient */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${step.color} opacity-0 group-hover:opacity-5 rounded-2xl transition-opacity duration-500 blur-lg`} />

                  {/* Card content */}
                  <div className="relative bg-card/60 dark:bg-zinc-950/60 backdrop-blur-xl border border-border/40 hover:border-border/80 rounded-2xl p-8 h-full flex flex-col transition-all duration-300 shadow-sm hover:shadow-lg group-hover:bg-card/80">
                    {/* Step Number */}
                    <motion.div
                      whileHover={{ scale: 1.1, rotate: 10 }}
                      className={`w-14 h-14 rounded-xl bg-gradient-to-br ${step.color} flex items-center justify-center mb-6 shadow-lg flex-shrink-0`}
                    >
                      <span className="text-xl font-black text-white">{step.number}</span>
                    </motion.div>

                    {/* Icon */}
                    <div className={`mb-4 text-foreground opacity-60 group-hover:opacity-100 transition-opacity`}>
                      {step.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-grow">
                      <h3 className="text-xl font-bold text-foreground mb-3">{step.title}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">{step.description}</p>
                    </div>

                    {/* Hover accent */}
                    <div className={`absolute inset-x-0 -top-px h-px bg-gradient-to-r ${step.color} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* CTA Below Steps */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="text-center mt-16"
        >
          <p className="text-muted-foreground mb-6">
            Ready to create professional content? Start with a free account today.
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-8 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
          >
            Try Free for 7 Days
          </motion.button>
        </motion.div>
      </div>
    </section>
  );
}
