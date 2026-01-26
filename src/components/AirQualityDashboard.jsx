import React, { useState, useEffect, useRef, useCallback } from 'react';
import { database, ref, onValue } from '../firebase';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, AreaChart, Area
} from 'recharts';
import DatePicker from 'react-datepicker';
import { format, subDays, startOfDay, endOfDay, isAfter } from 'date-fns';
import './AirQualityDashboard.css';
import 'react-datepicker/dist/react-datepicker.css';

const AirQualityDashboard = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedDevice, setSelectedDevice] = useState('ESP32A');
  const [selectedLog, setSelectedLog] = useState(null);
  const [graphDevice, setGraphDevice] = useState('ESP32A');
  const [graphType, setGraphType] = useState('line');
  const [graphMetric, setGraphMetric] = useState('pm25');
  const [comparisonMetric, setComparisonMetric] = useState('pm25');
  const [comparisonGraphType, setComparisonGraphType] = useState('line');
  const [timeRange, setTimeRange] = useState('20');
  const [selectedDevicesForComparison, setSelectedDevicesForComparison] = useState(['ESP32A']);
  const [timeInterval, setTimeInterval] = useState('hour');
  const mountedRef = useRef(true);
  const unsubscribeRef = useRef(null);
  const deviceColors = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088fe', '#00c49f'];
  const [calibrationTimeRange, setCalibrationTimeRange] = useState('all');
  // Add new state for date picker
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [startDate, setStartDate] = useState(subDays(new Date(), 7)); // Default: last 7 days
  const [endDate, setEndDate] = useState(new Date());
  const [customDateRange, setCustomDateRange] = useState(false);

  useEffect(() => {
    mountedRef.current = true;

    const initializeFirebase = () => {
      try {
        if (!database) {
          setError('Firebase not initialized. Check your API key.');
          setLoading(false);
          return null;
        }

        const rootRef = ref(database);

        const unsubscribe = onValue(
          rootRef,
          (snapshot) => {
            if (!mountedRef.current) return;
            const data = snapshot.val();
            console.log('📊 Complete Firebase Data:', data);
            setDashboardData(data);
            setLoading(false);
            setError(null);
          },
          (firebaseError) => {
            if (!mountedRef.current) return;
            console.error('❌ Firebase error:', firebaseError);
            setError(`Failed to fetch data: ${firebaseError.message}`);
            setLoading(false);
          }
        );

        return unsubscribe;
      } catch (initError) {
        console.error('Initialization error:', initError);
        setError(initError.message);
        setLoading(false);
        return null;
      }
    };

    const timeoutId = setTimeout(() => {
      const unsubscribe = initializeFirebase();
      if (unsubscribe) {
        unsubscribeRef.current = unsubscribe;
      }
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      mountedRef.current = false;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  const formatTimestamp = useCallback((timestampStr) => {
    if (!timestampStr || typeof timestampStr !== 'string') return 'N/A';

    try {
      const parts = timestampStr.split('_');
      if (parts.length < 2) return timestampStr;

      const [datePart, timePart] = parts;
      const dateParts = datePart.split('-');
      const timeParts = timePart.split('-');

      if (dateParts.length < 3 || timeParts.length < 3) return timestampStr;

      const [year, month, day] = dateParts;
      const [hour, minute, second] = timeParts;

      const date = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
      );

      return date.toLocaleString();
    } catch {
      return timestampStr;
    }
  }, []);

  const getAllDevices = useCallback(() => {
    return ['ESP32A', 'ESP32B', 'ESP32C', 'ESP32D'];
  }, []);

  const getDeviceData = useCallback((deviceId) => {
    if (!dashboardData?.AirQuality?.[deviceId]) return null;

    const deviceData = dashboardData.AirQuality[deviceId];
    const result = {};

    Object.entries(deviceData).forEach(([key, value]) => {
      if (key.match(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/)) {
        result[key] = value;
      }
    });

    return Object.keys(result).length > 0 ? result : null;
  }, [dashboardData]);

  const getDeviceStatus = useCallback((deviceId) => {
    const data = getDeviceData(deviceId);
    return {
      isActive: !!data && Object.keys(data).length > 0,
      lastUpdate: data ? Object.keys(data).sort((a, b) => b.localeCompare(a))[0] : null,
      readingCount: data ? Object.keys(data).length : 0
    };
  }, [getDeviceData]);

  const getLatestDeviceReading = useCallback((deviceId) => {
    const deviceData = getDeviceData(deviceId);
    if (!deviceData || typeof deviceData !== 'object') return null;

    const timestamps = Object.keys(deviceData).sort((a, b) => b.localeCompare(a));
    if (timestamps.length === 0) return null;

    const latestTimestamp = timestamps[0];
    const data = deviceData[latestTimestamp];

    if (!data || typeof data !== 'object') return null;

    return {
      device: deviceId,
      timestamp: latestTimestamp,
      data: {
        pm25: data.pm25 || data.PM25 || 'N/A',
        temp: data.temp || data.temperature || 'N/A',
        hum: data.hum || data.humidity || 'N/A',
        co2: data.co2 || data.CO2 || 'N/A',
        pm10: data.pm10 || data.PM10 || 'N/A',
        press: data.press || data.pressure || data.pres || 'N/A',
        ch0: data.ch0 || 'N/A',
        ch1: data.ch1 || 'N/A',
        no2: data.no2 || 'N/A',
        so2: data.so2 || 'N/A',
        dev: data.dev || 'Unknown',
        version: data.version || 'Not specified'
      }
    };
  }, [getDeviceData]);

  const getFilteredDeviceHistory = useCallback((deviceId, interval = 'hour') => {
    const deviceData = getDeviceData(deviceId);
    if (!deviceData) return [];

    const now = new Date();
    const filteredData = [];

    // Convert all data entries
    Object.entries(deviceData).forEach(([timestamp, data]) => {
      try {
        const parts = timestamp.split('_');
        if (parts.length < 2) return;

        const [datePart, timePart] = parts;
        const dateParts = datePart.split('-');
        const timeParts = timePart.split('-');

        if (dateParts.length < 3 || timeParts.length < 3) return;

        const recordDate = new Date(
          parseInt(dateParts[0]),
          parseInt(dateParts[1]) - 1,
          parseInt(dateParts[2]),
          parseInt(timeParts[0]),
          parseInt(timeParts[1]),
          parseInt(timeParts[2] || 0)
        );

        let shouldInclude = false;
        let timeLabel = '';

        switch (interval) {
          case 'hour': {
            // Last 24 hours with exact time
            const hoursDiff = (now - recordDate) / (1000 * 60 * 60);
            if (hoursDiff <= 24) {
              shouldInclude = true;
              // Show full HH:MM:SS for hour interval
              const hours = recordDate.getHours().toString().padStart(2, '0');
              const minutes = recordDate.getMinutes().toString().padStart(2, '0');
              const seconds = recordDate.getSeconds().toString().padStart(2, '0');
              timeLabel = `${hours}:${minutes}:${seconds}`;
            }
            break;
          }

          case 'week': {
            // Last 7 days with exact date and time
            const daysDiff = (now - recordDate) / (1000 * 60 * 60 * 24);
            if (daysDiff <= 7) {
              shouldInclude = true;
              // Show date and full HH:MM:SS for week interval
              const month = recordDate.toLocaleDateString('en-US', { month: 'short' });
              const day = recordDate.getDate();
              const hours = recordDate.getHours().toString().padStart(2, '0');
              const minutes = recordDate.getMinutes().toString().padStart(2, '0');
              const seconds = recordDate.getSeconds().toString().padStart(2, '0');
              timeLabel = `${month} ${day} ${hours}:${minutes}:${seconds}`;
            }
            break;
          }

          case 'month': {
            // Last 30 days with date and hour
            const daysDiff = (now - recordDate) / (1000 * 60 * 60 * 24);
            if (daysDiff <= 31) {
              shouldInclude = true;
              // Show date and hour for month interval
              const month = recordDate.toLocaleDateString('en-US', { month: 'short' });
              const day = recordDate.getDate();
              const hours = recordDate.getHours().toString().padStart(2, '0');
              timeLabel = `${month} ${day} ${hours}:00`;
            }
            break;
          }

          case 'year': {
            // Last 12 months with month and day
            const monthsDiff = (now.getFullYear() - recordDate.getFullYear()) * 12 +
                            (now.getMonth() - recordDate.getMonth());
            if (monthsDiff <= 12) {
              shouldInclude = true;
              // Show month and day for year interval
              const month = recordDate.toLocaleDateString('en-US', { month: 'short' });
              const day = recordDate.getDate();
              timeLabel = `${month} ${day}`;
            }
            break;
          }

          default: {
            shouldInclude = true;
            timeLabel = recordDate.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            });
            break;
          }
        }

        if (shouldInclude) {
          filteredData.push({
            timestamp, // Keep original timestamp for reference
            time: timeLabel,
            originalTime: timestamp, // Add original timestamp for debugging
            recordDate: recordDate, // Add Date object for sorting
            pm25: parseFloat(data.pm25 || data.PM25 || 0),
            temp: parseFloat(data.temp || data.temperature || 0),
            hum: parseFloat(data.hum || data.humidity || 0),
            co2: parseFloat(data.co2 || data.CO2 || 0),
            pm10: parseFloat(data.pm10 || data.PM10 || 0),
            press: parseFloat(data.press || data.pressure || data.pres || 0)
          });
        }
      } catch (error) {
        console.error('Error processing timestamp:', timestamp, error);
      }
    });

    // Sort by date (oldest to newest)
    filteredData.sort((a, b) => a.recordDate - b.recordDate);

    // For hour and week intervals, don't group - show individual readings
    if (interval === 'hour' || interval === 'week') {
      // Limit number of points for better visibility
      if (interval === 'hour') {
        return filteredData.slice(-50); // Last 50 readings for hour view
      } else {
        return filteredData.slice(-100); // Last 100 readings for week view
      }
    }

    // For month and year intervals, group by time periods
    const groupedData = {};

    if (interval === 'month') {
      // Group by day and hour
      filteredData.forEach(item => {
        const month = item.recordDate.toLocaleDateString('en-US', { month: 'short' });
        const day = item.recordDate.getDate();
        const hour = item.recordDate.getHours();
        const groupingKey = `${month} ${day} ${hour.toString().padStart(2, '0')}:00`;

        if (!groupedData[groupingKey]) {
          groupedData[groupingKey] = {
            time: groupingKey,
            pm25: [],
            temp: [],
            hum: [],
            co2: [],
            pm10: [],
            press: []
          };
        }
        groupedData[groupingKey].pm25.push(item.pm25);
        groupedData[groupingKey].temp.push(item.temp);
        groupedData[groupingKey].hum.push(item.hum);
        groupedData[groupingKey].co2.push(item.co2);
        groupedData[groupingKey].pm10.push(item.pm10);
        groupedData[groupingKey].press.push(item.press);
      });
    } else if (interval === 'year') {
      // Group by day
      filteredData.forEach(item => {
        const month = item.recordDate.toLocaleDateString('en-US', { month: 'short' });
        const day = item.recordDate.getDate();
        const groupingKey = `${month} ${day}`;

        if (!groupedData[groupingKey]) {
          groupedData[groupingKey] = {
            time: groupingKey,
            pm25: [],
            temp: [],
            hum: [],
            co2: [],
            pm10: [],
            press: []
          };
        }
        groupedData[groupingKey].pm25.push(item.pm25);
        groupedData[groupingKey].temp.push(item.temp);
        groupedData[groupingKey].hum.push(item.hum);
        groupedData[groupingKey].co2.push(item.co2);
        groupedData[groupingKey].pm10.push(item.pm10);
        groupedData[groupingKey].press.push(item.press);
      });
    }

    // Calculate averages for grouped data
    const result = Object.values(groupedData).map(group => ({
      time: group.time,
      pm25: group.pm25.length > 0 ?
        group.pm25.reduce((a, b) => a + b, 0) / group.pm25.length : 0,
      temp: group.temp.length > 0 ?
        group.temp.reduce((a, b) => a + b, 0) / group.temp.length : 0,
      hum: group.hum.length > 0 ?
        group.hum.reduce((a, b) => a + b, 0) / group.hum.length : 0,
      co2: group.co2.length > 0 ?
        group.co2.reduce((a, b) => a + b, 0) / group.co2.length : 0,
      pm10: group.pm10.length > 0 ?
        group.pm10.reduce((a, b) => a + b, 0) / group.pm10.length : 0,
      press: group.press.length > 0 ?
        group.press.reduce((a, b) => a + b, 0) / group.press.length : 0
    }));

    return result;
  }, [getDeviceData]);

  const getDeviceHistory = useCallback((deviceId, limit = 10) => {
    const deviceData = getDeviceData(deviceId);
    if (!deviceData) return [];

    return Object.entries(deviceData)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, limit)
      .map(([timestamp, data]) => ({
        timestamp,
        time: formatTimestamp(timestamp).split(', ')[1] || timestamp,
        pm25: parseFloat(data.pm25 || data.PM25 || 0),
        temp: parseFloat(data.temp || data.temperature || 0),
        hum: parseFloat(data.hum || data.humidity || 0),
        co2: parseFloat(data.co2 || data.CO2 || 0),
        pm10: parseFloat(data.pm10 || data.PM10 || 0),
        press: parseFloat(data.press || data.pressure || data.pres || 0),
        ch0: parseFloat(data.ch0 || 0),
        ch1: parseFloat(data.ch1 || 0),
        no2: parseFloat(data.no2 || 0),
        so2: parseFloat(data.so2 || 0),
        dev: data.dev || 'Unknown',
        version: data.version || 'N/A'
      }))
      .reverse();
  }, [getDeviceData, formatTimestamp]);

  const getAirQualityLevel = useCallback((pm25) => {
    const pm25Value = parseFloat(pm25);

    if (isNaN(pm25Value)) {
      return { level: 'Unknown', color: '#95a5a6', emoji: '❓' };
    }

    if (pm25Value <= 12) return { level: 'Good', color: '#2ecc71', emoji: '😊' };
    if (pm25Value <= 35) return { level: 'Moderate', color: '#f39c12', emoji: '😐' };
    if (pm25Value <= 55) return { level: 'Unhealthy for Sensitive', color: '#e74c3c', emoji: '😷' };
    if (pm25Value <= 150) return { level: 'Unhealthy', color: '#c0392b', emoji: '😨' };
    return { level: 'Hazardous', color: '#8b0000', emoji: '☠️' };
  }, []);

  const formatSensorValue = useCallback((value, unit = '') => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'number') {
      return `${value.toFixed(2)}${unit}`;
    }
    return `${value}${unit}`;
  }, []);

  const getSafeDataValue = useCallback((data, key, defaultValue = 'N/A') => {
    if (!data || typeof data !== 'object') return defaultValue;

    const fieldVariations = {
      pm25: ['pm25', 'PM25'],
      temp: ['temp', 'temperature'],
      hum: ['hum', 'humidity'],
      co2: ['co2', 'CO2'],
      pm10: ['pm10', 'PM10'],
      press: ['press', 'pressure', 'pres'],
      ch0: ['ch0'],
      ch1: ['ch1'],
      no2: ['no2'],
      so2: ['so2'],
      dev: ['dev'],
      version: ['version']
    };

    const variations = fieldVariations[key] || [key];

    for (const variation of variations) {
      const value = data[variation];
      if (value !== undefined && value !== null) {
        return value;
      }
    }

    return defaultValue;
  }, []);

  const getComparisonData = useCallback(() => {
    const allData = [];
    const timePoints = new Set();

    selectedDevicesForComparison.forEach(deviceId => {
      const history = getDeviceHistory(deviceId, parseInt(timeRange));
      history.forEach(entry => {
        timePoints.add(entry.time);
      });
    });

    Array.from(timePoints).sort().forEach(time => {
      const dataPoint = { time };

      selectedDevicesForComparison.forEach(deviceId => {
        const history = getDeviceHistory(deviceId, parseInt(timeRange));
        const entry = history.find(e => e.time === time);
        dataPoint[deviceId] = entry ? entry[comparisonMetric] : null;
      });

      allData.push(dataPoint);
    });

    return allData.slice(-parseInt(timeRange));
  }, [selectedDevicesForComparison, getDeviceHistory, comparisonMetric, timeRange]);

  const getDeviceStats = useCallback((deviceId, metric) => {
    const history = getDeviceHistory(deviceId, parseInt(timeRange));
    if (history.length === 0) return { min: 0, max: 0, avg: 0, trend: 0 };

    const values = history.map(item => item[metric]).filter(val => val !== null && !isNaN(val));

    if (values.length === 0) return { min: 0, max: 0, avg: 0, trend: 0 };

    const min = Math.min(...values).toFixed(2);
    const max = Math.max(...values).toFixed(2);
    const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);

    let trend = 0;
    if (values.length > 1) {
      const firstHalf = values.slice(0, Math.floor(values.length / 2));
      const secondHalf = values.slice(Math.floor(values.length / 2));
      const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      trend = avgSecond - avgFirst;
    }

    return {
      min: parseFloat(min),
      max: parseFloat(max),
      avg: parseFloat(avg),
      trend: parseFloat(trend.toFixed(2))
    };
  }, [getDeviceHistory, timeRange]);

  const toggleDeviceForComparison = useCallback((deviceId) => {
    setSelectedDevicesForComparison(prev => {
      if (prev.includes(deviceId)) {
        return prev.length > 1 ? prev.filter(id => id !== deviceId) : prev;
      } else {
        return [...prev, deviceId];
      }
    });
  }, []);

  // New function to get calibration data for ESP32A
  // First, let's add a debug function to log the calibration data structure
  useEffect(() => {
    if (dashboardData?.calibration_time) {
      console.log('📊 Calibration Time Structure:', dashboardData.calibration_time);

      // Log the first few entries to understand the structure
      const entries = Object.entries(dashboardData.calibration_time);
      if (entries.length > 0) {
        console.log('📊 First calibration entry:', entries[0]);
        console.log('📊 First entry keys:', Object.keys(entries[0][1]));
      }
    }
  }, [dashboardData]);

  // Update getCalibrationData function to not use subHours
  const getCalibrationData = useCallback(() => {
    if (!dashboardData?.calibration_time) {
      return [];
    }

    const calibrationEntries = Object.entries(dashboardData.calibration_time);
    const calibrationData = [];
    const now = new Date();

    // Define time range boundaries based on selection
    let startTime = 0;
    let endTime = Infinity;

    if (customDateRange) {
      // Use custom date range
      startTime = startOfDay(startDate).getTime();
      endTime = endOfDay(endDate).getTime();
    } else {
      // Use predefined ranges (calculate hours for 1H range)
      switch (calibrationTimeRange) {
        case '1h':
          startTime = now.getTime() - (1 * 60 * 60 * 1000); // 1 hour ago
          break;
        case '24h':
          startTime = now.getTime() - (24 * 60 * 60 * 1000); // 24 hours ago
          break;
        case '7d':
          startTime = now.getTime() - (7 * 24 * 60 * 60 * 1000); // 7 days ago
          break;
        case '30d':
          startTime = now.getTime() - (30 * 24 * 60 * 60 * 1000); // 30 days ago
          break;
        case 'all':
          startTime = 0; // All data
          break;
      }
    }

    calibrationEntries.forEach(([timestamp, data]) => {
      try {
        let esp32Data = null;

        // Try different possible structures
        if (data && typeof data === 'object') {
          if (data['ESP32_A']) {
            esp32Data = data['ESP32_A'];
          } else if (data['ESP32A']) {
            esp32Data = data['ESP32A'];
          } else if (data['ESP32']) {
            esp32Data = data['ESP32'];
          } else if (data.co2 !== undefined || data.CO2 !== undefined || data.press !== undefined) {
            esp32Data = data;
          } else {
            const keys = Object.keys(data);
            if (keys.length > 0) {
              const firstKey = keys[0];
              if (data[firstKey] && typeof data[firstKey] === 'object') {
                esp32Data = data[firstKey];
              }
            }
          }
        }

        if (!esp32Data) return;

        // Parse the timestamp
        const parts = timestamp.split('_');
        if (parts.length < 2) return;

        const [datePart, timePart] = parts;
        const dateParts = datePart.split('-');
        const timeParts = timePart.split('-');

        if (dateParts.length < 3 || timeParts.length < 3) return;

        const recordDate = new Date(
          parseInt(dateParts[0]),
          parseInt(dateParts[1]) - 1,
          parseInt(dateParts[2]),
          parseInt(timeParts[0]),
          parseInt(timeParts[1]),
          parseInt(timeParts[2] || 0)
        );

        const recordTime = recordDate.getTime();

        // Check if within selected time range
        if (recordTime < startTime || recordTime > endTime) return;

        const formattedTime = recordDate.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        // Extract data
        const co2 = parseFloat(esp32Data.co2 || esp32Data.CO2 || 0);
        const press = parseFloat(esp32Data.press || esp32Data.pressure || esp32Data.pres || 0);

        calibrationData.push({
          timestamp,
          time: formattedTime,
          fullDate: recordDate.toLocaleString(),
          date: recordDate.toLocaleDateString(),
          datetime: recordDate,
          co2: isNaN(co2) ? 0 : co2,
          pressure: isNaN(press) ? 0 : press,
          pm25: parseFloat(esp32Data.pm25 || esp32Data.PM25 || 0),
          temp: parseFloat(esp32Data.temp || esp32Data.temperature || 0),
          hum: parseFloat(esp32Data.hum || esp32Data.humidity || 0),
          pm10: parseFloat(esp32Data.pm10 || esp32Data.PM10 || 0),
          ch0: parseFloat(esp32Data.ch0 || 0),
          ch1: parseFloat(esp32Data.ch1 || 0),
          no2: parseFloat(esp32Data.no2 || 0),
          so2: parseFloat(esp32Data.so2 || 0),
          rawData: esp32Data
        });

      } catch (error) {
        console.error(`Error processing calibration timestamp ${timestamp}:`, error);
      }
    });

    // Sort by datetime (oldest to newest for graph)
    return calibrationData.sort((a, b) => a.datetime - b.datetime);
  }, [dashboardData, calibrationTimeRange, customDateRange, startDate, endDate]);

  // Function to handle preset range selection
  const handlePresetRange = (range) => {
    setCalibrationTimeRange(range);
    setCustomDateRange(false);
  };

  // Function to handle custom date range selection
  const handleCustomRange = () => {
    setCustomDateRange(true);
    setShowDatePicker(true);
  };

  // Function to apply custom date range
  const applyCustomDateRange = () => {
    if (isAfter(startDate, endDate)) {
      alert('Start date cannot be after end date');
      return;
    }
    setCustomDateRange(true);
    setShowDatePicker(false);
  };

  // Get formatted date range text
  const getDateRangeText = () => {
    if (customDateRange) {
      return `${format(startDate, 'MMM dd, yyyy')} - ${format(endDate, 'MMM dd, yyyy')}`;
    }

    switch (calibrationTimeRange) {
      case '1h': return 'Last 1 Hour';
      case '24h': return 'Last 24 Hours';
      case '7d': return 'Last 7 Days';
      case '30d': return 'Last 30 Days';
      case 'all': return 'All Time';
      default: return 'Select Range';
    }
  };

  // Function to set quick preset ranges
  const setQuickPresetRange = (days) => {
    const end = new Date();
    const start = subDays(end, days);
    setStartDate(start);
    setEndDate(end);
    setCustomDateRange(true);
    setShowDatePicker(false);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading air quality data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h3>Error</h3>
        <p>{error}</p>
        <div className="troubleshooting">
          <h4>Troubleshooting Steps:</h4>
          <ol>
            <li>Check if Firebase API key is correctly configured</li>
            <li>Verify database rules allow reading</li>
            <li>Check your internet connection</li>
            <li>Refresh the page</li>
          </ol>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="no-data">
        <h3>No Data Available</h3>
        <p>No air quality data found in Firebase database.</p>
      </div>
    );
  }

  const allDevices = getAllDevices();
  const deviceStatuses = allDevices.map(device => ({
    id: device,
    ...getDeviceStatus(device)
  }));

  const activeDevices = deviceStatuses.filter(d => d.isActive);
  const inactiveDevices = deviceStatuses.filter(d => !d.isActive);

  const deviceHistory = getFilteredDeviceHistory(graphDevice, timeInterval);
  const calibrationData = getCalibrationData();

  const graphConfig = {
    pm25: { name: 'PM2.5', unit: 'μg/m³', color: '#8884d8' },
    pm10: { name: 'PM10', unit: 'μg/m³', color: '#0088fe' },
    temp: { name: 'Temperature', unit: '°C', color: '#82ca9d' },
    hum: { name: 'Humidity', unit: '%', color: '#ffc658' },
    co2: { name: 'CO₂', unit: 'ppm', color: '#ff8042' },
    press: { name: 'Pressure', unit: 'hPa', color: '#00c49f' },
    ch0: { name: 'Channel 0', unit: 'V', color: '#8dd1e1' },
    ch1: { name: 'Channel 1', unit: 'V', color: '#a4de6c' },
    no2: { name: 'NO₂', unit: 'ppm', color: '#d0ed57' },
    so2: { name: 'SO₂', unit: 'ppm', color: '#ffc0cb' }
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>🌤️ IoT Air Quality Monitoring System</h1>
        <p>Real-time environmental data from multiple sensors</p>
      </header>

      <div className="tabs">
        <button
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveTab('overview')}
        >
          📊 Overview
        </button>
        <button
          className={activeTab === 'devices' ? 'active' : ''}
          onClick={() => setActiveTab('devices')}
        >
          🔧 Devices
        </button>
        <button
          className={activeTab === 'graphs' ? 'active' : ''}
          onClick={() => setActiveTab('graphs')}
        >
          📈 Graphs
        </button>
        <button
          className={activeTab === 'calibration' ? 'active' : ''}
          onClick={() => setActiveTab('calibration')}
        >
          🎯 Calibration
        </button>
        <button
          className={activeTab === 'raw' ? 'active' : ''}
          onClick={() => setActiveTab('raw')}
        >
          🔍 Raw Data
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="overview-tab">
          {/* ... (keep existing overview tab content exactly as is) ... */}
          <div className="stats-grid">
            <div className="stat-card primary">
              <h3>Total Devices</h3>
              <div className="stat-value">
                {allDevices.length}
              </div>
              <div className="stat-label">All Devices</div>
            </div>

            <div className="stat-card success">
              <h3>Active Devices</h3>
              <div className="stat-value">{activeDevices.length}</div>
              <div className="stat-label">Online</div>
            </div>

            <div className="stat-card warning">
              <h3>Inactive Devices</h3>
              <div className="stat-value">{inactiveDevices.length}</div>
              <div className="stat-label">Offline</div>
            </div>

            <div className="stat-card info">
              <h3>Total Readings</h3>
              <div className="stat-value">
                {deviceStatuses.reduce((sum, device) => sum + device.readingCount, 0)}
              </div>
              <div className="stat-label">Data Points</div>
            </div>
          </div>

          <div className="devices-status-section">
            <h2>Device Status ({allDevices.length} Total)</h2>
            <div className="devices-status-grid">
              {activeDevices.map(device => {
                const latestReading = getLatestDeviceReading(device.id);
                const airQuality = latestReading ?
                  getAirQualityLevel(latestReading.data.pm25) :
                  { level: 'Unknown', color: '#95a5a6', emoji: '❓' };

                return (
                  <div key={device.id} className="device-status-card active">
                    <div className="device-status-header">
                      <h3>{device.id}</h3>
                      <span className="device-status-badge active">● Active</span>
                    </div>

                    <div className="device-status-body">
                      <div className="status-info">
                        <span className="info-label">Last Update:</span>
                        <span className="info-value">
                          {device.lastUpdate ? formatTimestamp(device.lastUpdate) : 'Never'}
                        </span>
                      </div>

                      <div className="status-info">
                        <span className="info-label">Readings:</span>
                        <span className="info-value">{device.readingCount}</span>
                      </div>

                      {latestReading && (
                        <>
                          <div className="air-quality-status" style={{ backgroundColor: airQuality.color }}>
                            <span>{airQuality.emoji} {airQuality.level}</span>
                          </div>

                          <div className="current-reading">
                            <div className="reading-metric">
                              <span>PM2.5:</span>
                              <strong>{getSafeDataValue(latestReading.data, 'pm25')} μg/m³</strong>
                            </div>
                            <div className="reading-metric">
                              <span>Temp:</span>
                              <strong>{formatSensorValue(getSafeDataValue(latestReading.data, 'temp'), '°C')}</strong>
                            </div>
                            <div className="reading-metric">
                              <span>Humidity:</span>
                              <strong>{formatSensorValue(getSafeDataValue(latestReading.data, 'hum'), '%')}</strong>
                            </div>
                            <div className="reading-metric">
                              <span>Pressure:</span>
                              <strong>{formatSensorValue(getSafeDataValue(latestReading.data, 'press'), ' hPa')}</strong>
                            </div>
                            <div className="reading-metric">
                              <span>CO₂:</span>
                              <strong>{formatSensorValue(getSafeDataValue(latestReading.data, 'co2'), ' ppm')}</strong>
                            </div>
                            {getSafeDataValue(latestReading.data, 'version') !== 'Not specified' && (
                              <div className="reading-metric">
                                <span>Version:</span>
                                <strong>{getSafeDataValue(latestReading.data, 'version')}</strong>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {inactiveDevices.map(device => (
                <div key={device.id} className="device-status-card inactive">
                  <div className="device-status-header">
                    <h3>{device.id}</h3>
                    <span className="device-status-badge inactive">○ Inactive</span>
                  </div>

                  <div className="device-status-body">
                    <div className="status-info">
                      <span className="info-label">Last Update:</span>
                      <span className="info-value">Never</span>
                    </div>

                    <div className="status-info">
                      <span className="info-label">Readings:</span>
                      <span className="info-value">0</span>
                    </div>

                    <div className="device-offline-message">
                      <span>⚠️ Device offline or no data received</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="graph-section">
            <div className="graph-header">
              <h2>📈 Real-time Sensor Data</h2>
              <div className="graph-controls">
                <div className="control-group">
                  <label>Device:</label>
                  <select
                    value={graphDevice}
                    onChange={(e) => setGraphDevice(e.target.value)}
                    className="graph-select"
                  >
                    {activeDevices.map(device => (
                      <option key={device.id} value={device.id}>{device.id}</option>
                    ))}
                  </select>
                </div>

                <div className="control-group">
                  <label>Metric:</label>
                  <select
                    value={graphMetric}
                    onChange={(e) => setGraphMetric(e.target.value)}
                    className="graph-select"
                  >
                    {Object.entries(graphConfig).map(([key, config]) => (
                      <option key={key} value={key}>{config.name}</option>
                    ))}
                  </select>
                </div>

                <div className="control-group">
                  <label>Time Interval:</label>
                  <div className="time-interval-buttons">
                    <button
                      className={`interval-btn ${timeInterval === 'hour' ? 'active' : ''}`}
                      onClick={() => setTimeInterval('hour')}
                      title="Last 24 hours"
                    >
                      1H
                    </button>
                    <button
                      className={`interval-btn ${timeInterval === 'week' ? 'active' : ''}`}
                      onClick={() => setTimeInterval('week')}
                      title="Last 7 days"
                    >
                      1W
                    </button>
                    <button
                      className={`interval-btn ${timeInterval === 'month' ? 'active' : ''}`}
                      onClick={() => setTimeInterval('month')}
                      title="Last 31 days"
                    >
                      1M
                    </button>
                    <button
                      className={`interval-btn ${timeInterval === 'year' ? 'active' : ''}`}
                      onClick={() => setTimeInterval('year')}
                      title="Last 12 months"
                    >
                      1Y
                    </button>
                  </div>
                </div>

                <div className="control-group">
                  <label>Chart Type:</label>
                  <div className="chart-type-buttons">
                    <button
                      className={`chart-type-btn ${graphType === 'line' ? 'active' : ''}`}
                      onClick={() => setGraphType('line')}
                    >
                      Line
                    </button>
                    <button
                      className={`chart-type-btn ${graphType === 'bar' ? 'active' : ''}`}
                      onClick={() => setGraphType('bar')}
                    >
                      Bar
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="graph-container">
              <ResponsiveContainer width="100%" height={300}>
                {graphType === 'line' ? (
                  <LineChart data={deviceHistory}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: timeInterval === 'hour' ? 10 : 12 }}
                      angle={timeInterval === 'hour' ? -45 : timeInterval === 'year' ? 0 : -45}
                      textAnchor={timeInterval === 'hour' || timeInterval === 'year' ? 'end' : 'end'}
                      height={timeInterval === 'hour' ? 80 : 60}
                      interval={timeInterval === 'hour' ? 0 : 'preserveStartEnd'}
                    />
                    <YAxis
                      label={{
                        value: graphConfig[graphMetric].unit,
                        angle: -90,
                        position: 'insideLeft'
                      }}
                    />
                    <Tooltip
                      formatter={(value) => [`${value.toFixed(2)} ${graphConfig[graphMetric].unit}`, graphConfig[graphMetric].name]}
                      labelFormatter={(label) => {
                        let title = `Time: ${label}`;

                        // Find the original timestamp for this data point
                        const dataPoint = deviceHistory.find(item => item.time === label);

                        if (dataPoint?.originalTime) {
                          const originalFormatted = formatTimestamp(dataPoint.originalTime);

                          if (timeInterval === 'hour' || timeInterval === 'week') {
                            title = `Original: ${originalFormatted}\nDisplay: ${label}`;
                          } else if (timeInterval === 'month') {
                            title = `Date/Hour: ${label}\nData averaged from ${dataPoint.pm25?.length || 'multiple'} readings`;
                          } else if (timeInterval === 'year') {
                            title = `Date: ${label}\nData averaged from ${dataPoint.pm25?.length || 'multiple'} readings`;
                          }
                        }

                        return title;
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey={graphMetric}
                      stroke={graphConfig[graphMetric].color}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                      name={graphConfig[graphMetric].name}
                    />
                  </LineChart>
                ) : (
                  <BarChart data={deviceHistory}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: timeInterval === 'hour' ? 10 : 12 }}
                      angle={timeInterval === 'hour' ? -45 : timeInterval === 'year' ? 0 : -45}
                      textAnchor={timeInterval === 'hour' || timeInterval === 'year' ? 'end' : 'end'}
                      height={timeInterval === 'hour' ? 80 : 60}
                      interval={timeInterval === 'hour' ? 0 : 'preserveStartEnd'}
                    />
                    <YAxis
                      label={{
                        value: graphConfig[graphMetric].unit,
                        angle: -90,
                        position: 'insideLeft'
                      }}
                    />
                    <Tooltip
                      formatter={(value) => [`${value.toFixed(2)} ${graphConfig[graphMetric].unit}`, graphConfig[graphMetric].name]}
                      labelFormatter={(label) => {
                        let title = `Time: ${label}`;
                        if (timeInterval === 'hour') title = `Hour: ${label}`;
                        if (timeInterval === 'day') title = `Date: ${label}`;
                        if (timeInterval === 'week') title = `Week: ${label}`;
                        if (timeInterval === 'month') title = `Month: ${label}`;
                        return title;
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey={graphMetric}
                      fill={graphConfig[graphMetric].color}
                      name={graphConfig[graphMetric].name}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>

            <div className="graph-stats">
              {deviceHistory.length > 0 && (
                <div className="stats-summary">
                  <div className="stat-item">
                    <span className="stat-label">Current ({timeInterval === 'hour' ? 'Latest' : 'Recent Avg'}):</span>
                    <span className="stat-value">
                      {deviceHistory[deviceHistory.length - 1][graphMetric].toFixed(2)} {graphConfig[graphMetric].unit}
                    </span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Average:</span>
                    <span className="stat-value">
                      {(deviceHistory.reduce((sum, item) => sum + item[graphMetric], 0) / deviceHistory.length).toFixed(2)} {graphConfig[graphMetric].unit}
                    </span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Max:</span>
                    <span className="stat-value">
                      {Math.max(...deviceHistory.map(item => item[graphMetric])).toFixed(2)} {graphConfig[graphMetric].unit}
                    </span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Min:</span>
                    <span className="stat-value">
                      {Math.min(...deviceHistory.map(item => item[graphMetric])).toFixed(2)} {graphConfig[graphMetric].unit}
                    </span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Time Range:</span>
                    <span className="stat-value">
                      {timeInterval === 'hour' ? 'Last 24 hours' :
                      timeInterval === 'week' ? 'Last 7 days' :
                      timeInterval === 'month' ? 'Last 31 days' : 'Last 12 months'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'devices' && (
        <div className="devices-tab">
          <h2>Device Details</h2>

          <div className="device-selector">
            {allDevices.map(device => (
              <button
                key={device}
                className={`device-btn ${selectedDevice === device ? 'active' : ''}`}
                onClick={() => setSelectedDevice(device)}
              >
                {device}
              </button>
            ))}
          </div>

          <div className="device-details">
            {getDeviceData(selectedDevice) ? (
              <div className="device-data-container">
                <h3>{selectedDevice} - Historical Data</h3>
                <p>Total readings: {Object.keys(getDeviceData(selectedDevice)).length}</p>

                <div className="device-readings-table">
                  <div className="table-header">
                    <div className="table-cell">Timestamp</div>
                    <div className="table-cell">PM2.5</div>
                    <div className="table-cell">Temp</div>
                    <div className="table-cell">Humidity</div>
                    <div className="table-cell">CO₂</div>
                    <div className="table-cell">Actions</div>
                  </div>

                  {Object.entries(getDeviceData(selectedDevice))
                    .sort((a, b) => b[0].localeCompare(a[0]))
                    .slice(0, 10)
                    .map(([timestamp, data]) => (
                      <div key={timestamp} className="table-row">
                        <div className="table-cell">{formatTimestamp(timestamp)}</div>
                        <div className="table-cell">{getSafeDataValue(data, 'pm25')} μg/m³</div>
                        <div className="table-cell">{formatSensorValue(getSafeDataValue(data, 'temp'), '°C')}</div>
                        <div className="table-cell">{formatSensorValue(getSafeDataValue(data, 'hum'), '%')}</div>
                        <div className="table-cell">{formatSensorValue(getSafeDataValue(data, 'co2'), ' ppm')}</div>
                        <div className="table-cell">
                          <button
                            className="view-row-btn"
                            onClick={() => setSelectedLog({
                              device: selectedDevice,
                              timestamp,
                              ...data,
                              version: getSafeDataValue(data, 'version', 'N/A')
                            })}
                          >
                            View
                          </button>
                        </div>
                      </div>
                    ))}
                </div>

                {Object.keys(getDeviceData(selectedDevice)).length > 10 && (
                  <div className="more-readings">
                    <p>And {Object.keys(getDeviceData(selectedDevice)).length - 10} more readings...</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="no-device-data">
                <p>No data available for {selectedDevice}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'graphs' && (
        <div className="graphs-tab">
          <h2>📊 Advanced Graphs & Analytics</h2>

          <div className="graph-controls-panel">
            <div className="control-group">
              <label>📈 Metric:</label>
              <select
                value={comparisonMetric}
                onChange={(e) => setComparisonMetric(e.target.value)}
                className="graph-select"
              >
                {Object.entries(graphConfig).map(([key, config]) => (
                  <option key={key} value={key}>{config.name}</option>
                ))}
              </select>
            </div>

            <div className="control-group">
              <label>📊 Chart Type:</label>
              <div className="chart-type-buttons">
                <button
                  className={`chart-type-btn ${comparisonGraphType === 'line' ? 'active' : ''}`}
                  onClick={() => setComparisonGraphType('line')}
                >
                  Line
                </button>
                <button
                  className={`chart-type-btn ${comparisonGraphType === 'bar' ? 'active' : ''}`}
                  onClick={() => setComparisonGraphType('bar')}
                >
                  Bar
                </button>
                <button
                  className={`chart-type-btn ${comparisonGraphType === 'area' ? 'active' : ''}`}
                  onClick={() => setComparisonGraphType('area')}
                >
                  Area
                </button>
              </div>
            </div>

            <div className="control-group">
              <label>⏱️ Time Range:</label>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="graph-select"
              >
                <option value="10">Last 10 readings</option>
                <option value="20">Last 20 readings</option>
                <option value="30">Last 30 readings</option>
                <option value="50">Last 50 readings</option>
              </select>
            </div>
          </div>

          <div className="device-comparison-selector">
            <h3>🔧 Select Devices for Comparison:</h3>
            <div className="device-checkbox-grid">
              {activeDevices.map((device, index) => (
                <label key={device.id} className="device-checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedDevicesForComparison.includes(device.id)}
                    onChange={() => toggleDeviceForComparison(device.id)}
                    className="device-checkbox"
                  />
                  <span className="checkbox-custom" style={{
                    backgroundColor: selectedDevicesForComparison.includes(device.id) ? deviceColors[index % deviceColors.length] : '#eee',
                    borderColor: deviceColors[index % deviceColors.length]
                  }}>
                    {selectedDevicesForComparison.includes(device.id) ? '✓' : ''}
                  </span>
                  <span className="device-name">{device.id}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="comparison-section">
            <h3>📈 Multi-Device Comparison - {graphConfig[comparisonMetric].name}</h3>
            <div className="comparison-graph">
              <ResponsiveContainer width="100%" height={400}>
                {comparisonGraphType === 'line' ? (
                  <LineChart data={getComparisonData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      label={{
                        value: graphConfig[comparisonMetric].unit,
                        angle: -90,
                        position: 'insideLeft'
                      }}
                    />
                    <Tooltip
                      formatter={(value) => [`${value} ${graphConfig[comparisonMetric].unit}`, '']}
                      labelFormatter={(label) => `Time: ${label}`}
                    />
                    <Legend />
                    {selectedDevicesForComparison.map((deviceId, index) => (
                      <Line
                        key={deviceId}
                        type="monotone"
                        dataKey={deviceId}
                        stroke={deviceColors[index % deviceColors.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 6 }}
                        name={`${deviceId}`}
                      />
                    ))}
                  </LineChart>
                ) : comparisonGraphType === 'bar' ? (
                  <BarChart data={getComparisonData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      label={{
                        value: graphConfig[comparisonMetric].unit,
                        angle: -90,
                        position: 'insideLeft'
                      }}
                    />
                    <Tooltip
                      formatter={(value) => [`${value} ${graphConfig[comparisonMetric].unit}`, '']}
                      labelFormatter={(label) => `Time: ${label}`}
                    />
                    <Legend />
                    {selectedDevicesForComparison.map((deviceId, index) => (
                      <Bar
                        key={deviceId}
                        dataKey={deviceId}
                        fill={deviceColors[index % deviceColors.length]}
                        name={`${deviceId}`}
                      />
                    ))}
                  </BarChart>
                ) : (
                  <AreaChart data={getComparisonData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      label={{
                        value: graphConfig[comparisonMetric].unit,
                        angle: -90,
                        position: 'insideLeft'
                      }}
                    />
                    <Tooltip
                      formatter={(value) => [`${value} ${graphConfig[comparisonMetric].unit}`, '']}
                      labelFormatter={(label) => `Time: ${label}`}
                    />
                    <Legend />
                    {selectedDevicesForComparison.map((deviceId, index) => (
                      <Area
                        key={deviceId}
                        type="monotone"
                        dataKey={deviceId}
                        stroke={deviceColors[index % deviceColors.length]}
                        fill={deviceColors[index % deviceColors.length]}
                        fillOpacity={0.3}
                        name={`${deviceId}`}
                      />
                    ))}
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          <div className="individual-graphs-section">
            <h3>📱 Individual Device Analysis - {graphConfig[comparisonMetric].name}</h3>
            <div className="graphs-grid">
              {activeDevices.map((device, index) => {
                const stats = getDeviceStats(device.id, comparisonMetric);
                const latestReading = getLatestDeviceReading(device.id);
                const currentValue = latestReading ?
                  getSafeDataValue(latestReading.data, comparisonMetric, 0) : 0;

                return (
                  <div key={device.id} className="graph-card">
                    <div className="graph-card-header">
                      <h4>{device.id}</h4>
                      <div className="device-current-value">
                        Current:
                        <strong>{formatSensorValue(currentValue, ` ${graphConfig[comparisonMetric].unit}`)}</strong>
                      </div>
                    </div>
                    <div className="mini-graph-container">
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={getDeviceHistory(device.id, parseInt(timeRange))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                          <YAxis />
                          <Tooltip
                            formatter={(value) => [`${value} ${graphConfig[comparisonMetric].unit}`, graphConfig[comparisonMetric].name]}
                          />
                          <Line
                            type="monotone"
                            dataKey={comparisonMetric}
                            stroke={deviceColors[index % deviceColors.length]}
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="graph-card-stats">
                      <div className="stat-item">
                        <span>Min:</span>
                        <strong>{formatSensorValue(stats.min, ` ${graphConfig[comparisonMetric].unit}`)}</strong>
                      </div>
                      <div className="stat-item">
                        <span>Avg:</span>
                        <strong>{formatSensorValue(stats.avg, ` ${graphConfig[comparisonMetric].unit}`)}</strong>
                      </div>
                      <div className="stat-item">
                        <span>Max:</span>
                        <strong>{formatSensorValue(stats.max, ` ${graphConfig[comparisonMetric].unit}`)}</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="stats-summary-section">
            <h3>📊 Statistics Summary - {graphConfig[comparisonMetric].name}</h3>
            <div className="stats-table">
              <table>
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>Current</th>
                    <th>Average</th>
                    <th>Min</th>
                    <th>Max</th>
                    <th>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {activeDevices.map(device => {
                    const stats = getDeviceStats(device.id, comparisonMetric);
                    const latestReading = getLatestDeviceReading(device.id);
                    const current = latestReading ?
                      getSafeDataValue(latestReading.data, comparisonMetric, 0) : 0;

                    return (
                      <tr key={device.id}>
                        <td><strong>{device.id}</strong></td>
                        <td>{formatSensorValue(current, ` ${graphConfig[comparisonMetric].unit}`)}</td>
                        <td>{formatSensorValue(stats.avg, ` ${graphConfig[comparisonMetric].unit}`)}</td>
                        <td>{formatSensorValue(stats.min, ` ${graphConfig[comparisonMetric].unit}`)}</td>
                        <td>{formatSensorValue(stats.max, ` ${graphConfig[comparisonMetric].unit}`)}</td>
                        <td>
                          <span className={`status-indicator ${stats.trend > 0 ? 'up' : stats.trend < 0 ? 'down' : 'stable'}`}>
                            {stats.trend > 0 ? '↗️ Increasing' : stats.trend < 0 ? '↘️ Decreasing' : '➡️ Stable'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'calibration' && (
        <div className="calibration-tab">
          <h2>🎯 Sensor Calibration Data</h2>

          <div className="calibration-info">
            <div className="info-card">
              <h3>📊 Calibration Overview</h3>
              <p>This section displays CO₂ and Pressure sensor data from calibration tests.</p>
              <div className="calibration-stats">
                <div className="cal-stat">
                  <span className="cal-label">Total Readings:</span>
                  <span className="cal-value">{calibrationData.length}</span>
                </div>
                <div className="cal-stat">
                  <span className="cal-label">Time Range:</span>
                  <span className="cal-value">
                    {calibrationData.length > 0 ?
                      `${calibrationData[calibrationData.length - 1].fullDate} to ${calibrationData[0].fullDate}` :
                      'No data available'}
                  </span>
                </div>
                <div className="cal-stat">
                  <span className="cal-label">Data Structure:</span>
                  <span className="cal-value">
                    {calibrationData.length > 0 ? 'Found' : 'Checking...'}
                  </span>
                </div>
              </div>

              {/* Add debugging info */}
              <div className="debug-info" style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
                <button
                  onClick={() => {
                    console.log('📊 Full dashboardData:', dashboardData);
                    console.log('📊 Calibration data:', calibrationData);
                  }}
                  style={{ padding: '5px 10px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px' }}
                >
                  Debug in Console
                </button>
              </div>
            </div>
          </div>

          {calibrationData.length > 0 ? (
            <>
              {/* Keep the existing graph and table code here */}
              <div className="calibration-graph-section">
                <h3>CO₂ vs Pressure Correlation</h3>
                <p className="graph-description">
                  Dual Y-axis chart showing CO₂ (left, ppm) and Pressure (right, hPa) measurements over time.
                </p>

                <div className="calibration-graph">
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={calibrationData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="time"
                        tick={{ fontSize: 12 }}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis
                        yAxisId="left"
                        label={{
                          value: 'CO₂ (ppm)',
                          angle: -90,
                          position: 'insideLeft',
                          style: { fill: '#ff8042' }
                        }}
                        stroke="#ff8042"
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        label={{
                          value: 'Pressure (hPa)',
                          angle: 90,
                          position: 'insideRight',
                          style: { fill: '#00c49f' }
                        }}
                        stroke="#00c49f"
                      />
                      <Tooltip
                        formatter={(value, name) => {
                          if (name === 'co2') return [`${value.toFixed(2)} ppm`, 'CO₂'];
                          if (name === 'pressure') return [`${value.toFixed(2)} hPa`, 'Pressure'];
                          return [value, name];
                        }}
                        labelFormatter={(label) => {
                          const dataPoint = calibrationData.find(item => item.time === label);
                          return dataPoint ? `Time: ${label}\nDate: ${dataPoint.date}` : `Time: ${label}`;
                        }}
                      />
                      <Legend />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="co2"
                        stroke="#ff8042"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                        name="CO₂ (ppm)"
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="pressure"
                        stroke="#00c49f"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                        name="Pressure (hPa)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="calibration-controls">
            <div className="time-range-selector">
              <h3>⏱️ Select Time Range:</h3>

              <div className="preset-range-buttons">
                <button
                  className={`preset-range-btn ${!customDateRange && calibrationTimeRange === '1h' ? 'active' : ''}`}
                  onClick={() => handlePresetRange('1h')}
                >
                  Last 1 Hour
                </button>
                <button
                  className={`preset-range-btn ${!customDateRange && calibrationTimeRange === '24h' ? 'active' : ''}`}
                  onClick={() => handlePresetRange('24h')}
                >
                  Last 24 Hours
                </button>
                <button
                  className={`preset-range-btn ${!customDateRange && calibrationTimeRange === '7d' ? 'active' : ''}`}
                  onClick={() => handlePresetRange('7d')}
                >
                  Last 7 Days
                </button>
                <button
                  className={`preset-range-btn ${!customDateRange && calibrationTimeRange === '30d' ? 'active' : ''}`}
                  onClick={() => handlePresetRange('30d')}
                >
                  Last 30 Days
                </button>
                <button
                  className={`preset-range-btn ${!customDateRange && calibrationTimeRange === 'all' ? 'active' : ''}`}
                  onClick={() => handlePresetRange('all')}
                >
                  All Time
                </button>
                <button
                  className={`preset-range-btn custom ${customDateRange ? 'active' : ''}`}
                  onClick={handleCustomRange}
                >
                  📅 Custom Range
                </button>
              </div>

              {/* Quick preset buttons for custom range */}
              {showDatePicker && (
                <div className="quick-preset-buttons">
                  <button className="quick-preset" onClick={() => setQuickPresetRange(1)}>
                    Yesterday
                  </button>
                  <button className="quick-preset" onClick={() => setQuickPresetRange(7)}>
                    Last Week
                  </button>
                  <button className="quick-preset" onClick={() => setQuickPresetRange(30)}>
                    Last Month
                  </button>
                  <button className="quick-preset" onClick={() => {
                    const today = new Date();
                    setStartDate(startOfDay(today));
                    setEndDate(endOfDay(today));
                  }}>
                    Today
                  </button>
                </div>
              )}

              {/* Date Range Display */}
              <div className="selected-range-display">
                <span className="range-label">Selected Range:</span>
                <span className="range-value">{getDateRangeText()}</span>
                {customDateRange && (
                  <button
                    className="edit-range-btn"
                    onClick={() => setShowDatePicker(true)}
                  >
                    Edit
                  </button>
                )}
              </div>

              {/* Date Picker Modal */}
              {showDatePicker && (
                <div className="date-picker-modal-overlay" onClick={() => setShowDatePicker(false)}>
                  <div className="date-picker-modal" onClick={e => e.stopPropagation()}>
                    <div className="modal-header">
                      <h3>Select Date Range</h3>
                      <button className="close-modal" onClick={() => setShowDatePicker(false)}>×</button>
                    </div>

                    <div className="date-picker-container">
                      <div className="date-picker-column">
                        <label>Start Date</label>
                        <DatePicker
                          selected={startDate}
                          onChange={(date) => setStartDate(date)}
                          selectsStart
                          startDate={startDate}
                          endDate={endDate}
                          maxDate={endDate}
                          inline
                          calendarClassName="custom-calendar"
                        />
                      </div>

                      <div className="date-picker-column">
                        <label>End Date</label>
                        <DatePicker
                          selected={endDate}
                          onChange={(date) => setEndDate(date)}
                          selectsEnd
                          startDate={startDate}
                          endDate={endDate}
                          minDate={startDate}
                          maxDate={new Date()}
                          inline
                          calendarClassName="custom-calendar"
                        />
                      </div>
                    </div>

                    <div className="selected-dates-preview">
                      <div className="date-preview">
                        <span>From:</span>
                        <strong>{format(startDate, 'EEEE, MMMM dd, yyyy')}</strong>
                      </div>
                      <div className="date-preview">
                        <span>To:</span>
                        <strong>{format(endDate, 'EEEE, MMMM dd, yyyy')}</strong>
                      </div>
                    </div>

                    <div className="modal-actions">
                      <button className="cancel-btn" onClick={() => setShowDatePicker(false)}>
                        Cancel
                      </button>
                      <button className="apply-btn" onClick={applyCustomDateRange}>
                        Apply Date Range
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

              <div className="calibration-data-section">
                <h3>📋 Calibration Data Table</h3>
                <div className="calibration-table-container">
                  <table className="calibration-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>CO₂ (ppm)</th>
                        <th>Pressure (hPa)</th>
                        <th>Temperature (°C)</th>
                        <th>Humidity (%)</th>
                        <th>PM2.5 (μg/m³)</th>
                        <th>CH0 (V)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calibrationData.slice(0, 20).map((row, index) => (
                        <tr key={index}>
                          <td>{row.time}</td>
                          <td>{row.co2.toFixed(2)}</td>
                          <td>{row.pressure.toFixed(2)}</td>
                          <td>{row.temp.toFixed(2)}</td>
                          <td>{row.hum.toFixed(2)}</td>
                          <td>{row.pm25.toFixed(2)}</td>
                          <td>{row.ch0.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {calibrationData.length > 20 && (
                  <p className="more-data-info">Showing 20 of {calibrationData.length} calibration readings</p>
                )}
              </div>

              <div className="calibration-insights">
                <h3>🔍 Calibration Insights</h3>
                <div className="insights-grid">
                  <div className="insight-card">
                    <h4>CO₂ Statistics</h4>
                    <div className="insight-stat">
                      <span>Average:</span>
                      <strong>{(calibrationData.reduce((sum, row) => sum + row.co2, 0) / calibrationData.length).toFixed(2)} ppm</strong>
                    </div>
                    <div className="insight-stat">
                      <span>Range:</span>
                      <strong>{Math.min(...calibrationData.map(r => r.co2)).toFixed(2)} - {Math.max(...calibrationData.map(r => r.co2)).toFixed(2)} ppm</strong>
                    </div>
                    <div className="insight-stat">
                      <span>Std Dev:</span>
                      <strong>
                        {(() => {
                          const avg = calibrationData.reduce((sum, row) => sum + row.co2, 0) / calibrationData.length;
                          const variance = calibrationData.reduce((sum, row) => sum + Math.pow(row.co2 - avg, 2), 0) / calibrationData.length;
                          return Math.sqrt(variance).toFixed(2);
                        })()} ppm
                      </strong>
                    </div>
                  </div>
                  <div className="insight-card">
                    <h4>Pressure Statistics</h4>
                    <div className="insight-stat">
                      <span>Average:</span>
                      <strong>{(calibrationData.reduce((sum, row) => sum + row.pressure, 0) / calibrationData.length).toFixed(2)} hPa</strong>
                    </div>
                    <div className="insight-stat">
                      <span>Range:</span>
                      <strong>{Math.min(...calibrationData.map(r => r.pressure)).toFixed(2)} - {Math.max(...calibrationData.map(r => r.pressure)).toFixed(2)} hPa</strong>
                    </div>
                    <div className="insight-stat">
                      <span>Standard Pressure:</span>
                      <strong>1013.25 hPa</strong>
                    </div>
                  </div>
                  <div className="insight-card">
                    <h4>Correlation Analysis</h4>
                    <div className="insight-stat">
                      <span>Correlation Coef:</span>
                      <strong>
                        {(() => {
                          const co2Data = calibrationData.map(r => r.co2);
                          const pressureData = calibrationData.map(r => r.pressure);
                          const meanCo2 = co2Data.reduce((a, b) => a + b) / co2Data.length;
                          const meanPressure = pressureData.reduce((a, b) => a + b) / pressureData.length;
                          const covariance = co2Data.reduce((sum, co2, i) => sum + (co2 - meanCo2) * (pressureData[i] - meanPressure), 0) / (co2Data.length - 1);
                          const stdCo2 = Math.sqrt(co2Data.reduce((sum, co2) => sum + Math.pow(co2 - meanCo2, 2), 0) / (co2Data.length - 1));
                          const stdPressure = Math.sqrt(pressureData.reduce((sum, press) => sum + Math.pow(press - meanPressure, 2), 0) / (pressureData.length - 1));
                          return (covariance / (stdCo2 * stdPressure)).toFixed(3);
                        })()}
                      </strong>
                    </div>
                    <div className="insight-stat">
                      <span>Data Points:</span>
                      <strong>{calibrationData.length}</strong>
                    </div>
                    <div className="insight-stat">
                      <span>Time Span:</span>
                      <strong>{calibrationData.length > 1 ?
                        `${Math.round((new Date(calibrationData[0].timestamp.replace('_', ' ').replace(/-/g, ':')) -
                          new Date(calibrationData[calibrationData.length - 1].timestamp.replace('_', ' ').replace(/-/g, ':'))) / (1000 * 60 * 60))} hours` :
                        'N/A'}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="no-calibration-data">
              <div className="empty-state">
                <h3>📭 No Calibration Data Found</h3>
                <p>Check the browser console for debugging information (Press F12).</p>

                <div className="troubleshooting-tips">
                  <h4>How to debug:</h4>
                  <ol>
                    <li>Open browser console (F12 or Right-click → Inspect → Console)</li>
                    <li>Look for messages starting with 📊, 🔍, or ❌</li>
                    <li>Check what structure is actually in the Firebase data</li>
                    <li>Click the "Debug in Console" button above for more info</li>
                  </ol>
                </div>

                <div className="firebase-structure-possibilities">
                  <h4>Possible Firebase structures:</h4>
                  <div className="structure-examples">
                    <div className="structure-example">
                      <h5>Structure 1 (with device key):</h5>
                      <pre>
      {`calibration_time:
        2024-01-01_12-00-00:
          ESP32_A:
            co2: 400
            press: 1013
            temp: 25`}
                      </pre>
                    </div>
                    <div className="structure-example">
                      <h5>Structure 2 (direct data):</h5>
                      <pre>
      {`calibration_time:
        2024-01-01_12-00-00:
          co2: 400
          press: 1013
          temp: 25`}
                      </pre>
                    </div>
                    <div className="structure-example">
                      <h5>Structure 3 (different device name):</h5>
                      <pre>
      {`calibration_time:
        2024-01-01_12-00-00:
          ESP32A:
            co2: 400
            press: 1013
            temp: 25`}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'raw' && (
        <div className="raw-tab">
          <h2>Raw Firebase Data</h2>
          <div className="raw-data-container">
            <pre className="raw-data">
              {JSON.stringify(dashboardData, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {selectedLog && (
        <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setSelectedLog(null)}>×</button>
            <h3>Sensor Reading Details</h3>
            {selectedLog.device && (
              <p><strong>Device:</strong> {selectedLog.device}</p>
            )}
            {selectedLog.timestamp && (
              <p><strong>Time:</strong> {formatTimestamp(selectedLog.timestamp)}</p>
            )}
            <div className="modal-data">
              <table className="sensor-table">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Value</th>
                    <th>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(selectedLog)
                    .filter(([key]) => !['device', 'timestamp'].includes(key))
                    .map(([key, value]) => (
                      <tr key={key}>
                        <td>{key.toUpperCase()}</td>
                        <td>
                          {typeof value === 'number' ? value.toFixed(2) : value}
                        </td>
                        <td>
                          {key === 'temp' ? '°C' :
                           key === 'hum' ? '%' :
                           key === 'press' ? 'hPa' :
                           key === 'co2' ? 'ppm' :
                           key.includes('pm') ? 'μg/m³' :
                           key === 'ch0' || key === 'ch1' ? 'V' :
                           key === 'no2' || key === 'so2' ? 'ppm' :
                           ''}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AirQualityDashboard;