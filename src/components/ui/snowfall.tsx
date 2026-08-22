'use client';

import React, { useMemo } from 'react';
import styles from './snowfall.module.css';

const Snowfall = () => {
  const snowflakes = useMemo(() => {
    return Array.from({ length: 150 }).map((_, index) => {
      const style = {
        '--size': `${Math.random() * 0.75 + 0.25}rem`,
        '--left-initial': `${Math.random() * 100}vw`,
        '--left-final': `${Math.random() * 100}vw`,
        '--animation-delay': `-${Math.random() * 10}s`,
        '--animation-duration': `${Math.random() * 5 + 5}s`,
      };
      return <div key={index} className={styles.snowflake} style={style as React.CSSProperties} />;
    });
  }, []);

  return <div className={styles.snowfall}>{snowflakes}</div>;
};

export default Snowfall;
