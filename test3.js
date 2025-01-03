// Import required React components and hooks
import React, { useState, useEffect, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts';
import _ from 'lodash';

// PacketSignals class equivalent using EventEmitter
class PacketSignals extends EventEmitter {
  constructor() {
    super();
  }

  emitPacketReceived(data) {
    this.emit('packet_received', data);
  }
}

// PortAnalysisWindow Component
const PortAnalysisWindow = ({ portNumber, onClose }) => {
  const [timeData, setTimeData] = useState([]);
  const [amplitudeData, setAmplitudeData] = useState([]);
  const [amplitudeDataCh2, setAmplitudeDataCh2] = useState([]);
  const [activeTab, setActiveTab] = useState('intensity');
  const [measurements, setMeasurements] = useState({
    peakToPeakCh1: 'N/A',
    peakToPeakCh2: 'N/A',
    phaseDiff: 'N/A'
  });

  const MAX_DATA_POINTS = 1000;
  const SAMPLE_RATE = 100;
  const startTime = useRef(Date.now());
  const lastUpdateTime = useRef(Date.now());

  useEffect(() => {
    const updateTimer = setInterval(() => {
      updatePlots();
    }, 50);

    return () => clearInterval(updateTimer);
  }, []);

  const updatePlots = () => {
    const currentTime = Date.now();
    if (currentTime - lastUpdateTime.current < 100) {
      updateIntensityPlot();
      updateTimeDomainPlots();
      updateFrequencyDomainPlot();
    }
  };

  const extractSignalFromPayload = (payload) => {
    try {
      if (typeof payload === 'string') {
        // Clean payload and convert to bytes
        const cleanPayload = payload.replace(/[^0-9A-Fa-f]/g, '');
        const bytes = new Uint8Array(cleanPayload.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

        if (bytes.length >= 4) {
          // Try as float (4 bytes)
          const view = new DataView(bytes.buffer);
          return view.getFloat32(0) / 32768.0;
        } else if (bytes.length >= 2) {
          // Try as signed short (2 bytes)
          const view = new DataView(bytes.buffer);
          return view.getInt16(0) / 32768.0;
        } else {
          // Try as single byte
          return bytes[0] / 128.0;
        }
      }
    } catch (error) {
      console.error('Error extracting signal:', error);
    }
    return 0.0;
  };

  const updateData = (packetData) => {
    try {
      const currentTime = (Date.now() - startTime.current) / 1000;
      let signalValue;

      if (packetData.info && packetData.info !== "No Payload") {
        signalValue = extractSignalFromPayload(packetData.info);
      } else {
        signalValue = Math.sin(2 * Math.PI * 1.0 * currentTime);
      }

      // Update channel 1 data
      setTimeData(prev => [...prev.slice(-MAX_DATA_POINTS), currentTime]);
      setAmplitudeData(prev => [...prev.slice(-MAX_DATA_POINTS), signalValue]);

      // Generate channel 2 with phase shift
      const phaseShift = Math.PI / 3; // 60 degrees
      const signalValueCh2 = signalValue * Math.cos(2 * Math.PI * 1.0 * currentTime + phaseShift);
      setAmplitudeDataCh2(prev => [...prev.slice(-MAX_DATA_POINTS), signalValueCh2]);

      lastUpdateTime.current = Date.now();
    } catch (error) {
      console.error('Error updating data:', error);
    }
  };

  const IntensityPlot = () => {
    const data = timeData.map((time, index) => ({
      time,
      amplitude: amplitudeData[index]
    }));

    return (
      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="time" 
              label={{ value: 'Time (s)', position: 'bottom' }} 
            />
            <YAxis 
              label={{ value: 'Amplitude', angle: -90, position: 'left' }}
            />
            <Tooltip />
            <Line 
              type="monotone" 
              dataKey="amplitude" 
              stroke="#8884d8" 
              dot={false} 
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const TimeDomainPlot = () => {
    const data = timeData.map((time, index) => ({
      time,
      channel1: amplitudeData[index],
      channel2: amplitudeDataCh2[index]
    }));

    return (
      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="time" 
              label={{ value: 'Time (s)', position: 'bottom' }} 
            />
            <YAxis 
              label={{ value: 'Amplitude', angle: -90, position: 'left' }}
            />
            <Tooltip />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="channel1" 
              stroke="#8884d8" 
              name="Channel 1" 
              dot={false} 
            />
            <Line 
              type="monotone" 
              dataKey="channel2" 
              stroke="#82ca9d" 
              name="Channel 2" 
              dot={false} 
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const FrequencyDomainPlot = () => {
    const calculateFFT = () => {
      if (amplitudeData.length < 4) return [];

      // Prepare data for FFT
      const data = Array.from(amplitudeData);
      const n = data.length;

      // Remove DC component
      const mean = data.reduce((a, b) => a + b, 0) / n;
      const normalizedData = data.map(x => x - mean);

      // Apply Hanning window
      const hanningWindow = Array(n).fill().map((_, i) => 
        0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)))
      );
      const windowedData = normalizedData.map((x, i) => x * hanningWindow[i]);

      // Compute FFT
      const fft = new FFT(n);
      const spectrum = fft.forward(windowedData);

      // Calculate frequencies
      const frequencies = Array(n/2).fill().map((_, i) => i * SAMPLE_RATE / n);

      // Prepare plot data
      return frequencies.map((freq, i) => ({
        frequency: freq,
        amplitude: Math.abs(spectrum[i]) / n
      })).slice(1); // Skip DC component
    };

    const fftData = calculateFFT();

    return (
      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={fftData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="frequency" 
              label={{ value: 'Frequency (Hz)', position: 'bottom' }} 
            />
            <YAxis 
              label={{ value: 'Amplitude', angle: -90, position: 'left' }}
            />
            <Tooltip />
            <Line 
              type="monotone" 
              dataKey="amplitude" 
              stroke="#82ca9d" 
              dot={false} 
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div className="w-full max-w-4xl p-4">
      <h2 className="text-xl font-bold mb-4">Port {portNumber} Analysis</h2>
      
      <div className="mb-4">
        <div className="flex space-x-4">
          <button
            className={px-4 py-2 rounded ${activeTab === 'intensity' ? 'bg-blue-500 text-white' : 'bg-gray-200'}}>
            Intensity Plot
          </button>
          <button
            className={px-4 py-2 rounded ${activeTab === 'time' ? 'bg-blue-500 text-white' : 'bg-gray-200'}}
            onClick={() => setActiveTab('time')}
          >
            Time Domain
          </button>
          <button
            className={px-4 py-2 rounded ${activeTab === 'frequency' ? 'bg-blue-500 text-white' : 'bg-gray-200'}}
            onClick={() => setActiveTab('frequency')}
          >
            Frequency Domain
          </button>
        </div>
      </div>

      <div className="border rounded p-4">
        {activeTab === 'intensity' && <IntensityPlot />}
        {activeTab === 'time' && <TimeDomainPlot />}
        {activeTab === 'frequency' && <FrequencyDomainPlot />}
      </div>

      {activeTab === 'time' && (
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>Channel 1 Peak-to-Peak: {measurements.peakToPeakCh1}</div>
          <div>Channel 2 Peak-to-Peak: {measurements.peakToPeakCh2}</div>
          <div className="col-span-2">Phase Difference: {measurements.phaseDiff}</div>
        </div>
      )}
    </div>
  );
};

// Main UDP Monitor Application
const UDPMonitorApp = () => {
  const [packets, setPackets] = useState([]);
  const [selectedPacket, setSelectedPacket] = useState(null);
  const [packetRate, setPacketRate] = useState('0');
  const [portWindows, setPortWindows] = useState({});
  
  const packetCount = useRef(0);
  const lastUpdateTime = useRef(Date.now());
  const packetsSinceUpdate = useRef(0);
  const bytesSinceUpdate = useRef(0);

  useEffect(() => {
    // Start UDP sniffer
    startUDPSniffer();

    // Update packet rate every second
    const rateTimer = setInterval(updatePacketRate, 1000);

    return () => {
      clearInterval(rateTimer);
    };
  }, []);

  const startUDPSniffer = () => {
    // Note: In a browser environment, we'd need to use WebSocket or similar
    // to receive UDP packet data from a server
    console.log('UDP sniffer would start here in a real implementation');
  };

  const updatePacketRate = () => {
    const currentTime = Date.now();
    const timeDiff = (currentTime - lastUpdateTime.current) / 1000;

    if (timeDiff > 0) {
      const rate = packetsSinceUpdate.current / timeDiff;
      const bytesRate = bytesSinceUpdate.current / timeDiff;
      const bitsRate = bytesRate * 8;

      setPacketRate(
        ${rate.toFixed(2)} packets/s, ${bytesRate.toFixed(2)} B/s (${bitsRate.toFixed(2)} b/s)
      );
    }

    packetsSinceUpdate.current = 0;
    bytesSinceUpdate.current = 0;
    lastUpdateTime.current = currentTime;
  };

  const handlePacketReceived = (packetInfo) => {
    packetCount.current += 1;
    setPackets(prev => [...prev.slice(-100), packetInfo]);
    packetsSinceUpdate.current += 1;
    bytesSinceUpdate.current += packetInfo.length;

    // Update port windows if they exist
    if (portWindows[packetInfo.source_port]) {
      portWindows[packetInfo.source_port].update(packetInfo);
    }
    if (portWindows[packetInfo.dest_port]) {
      portWindows[packetInfo.dest_port].update(packetInfo);
    }
  };

  const handlePacketClick = (packet) => {
    setSelectedPacket(packet);
    
    // Create or show port windows
    const ports = [packet.source_port, packet.dest_port];
    ports.forEach(port => {
      if (!portWindows[port]) {
        setPortWindows(prev => ({
          ...prev,
          [port]: new PortAnalysisWindow(port)
        }));
      }
    });
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">UDP Packet Monitor</h1>
      
      <div className="mb-4">
        <table className="w-full border-collapse border">
          <thead>
            <tr>
              <th className="border p-2">No</th>
              <th className="border p-2">Time</th>
              <th className="border p-2">Source IP</th>
              <th className="border p-2">Destination IP</th>
              <th className="border p-2">Protocol</th>
              <th className="border p-2">Length</th>
              <th className="border p-2">Source Port</th>
              <th className="border p-2">Dest Port</th>
              <th className="border p-2">Info</th>
            </tr>
          </thead>
          <tbody>
            {packets.map((packet, index) => (
              <tr 
                key={index} 
                className="cursor-pointer hover:bg-gray-100"
                onClick={() => handlePacketClick(packet)}
              >
                <td className="border p-2">{packet.count}</td>
                <td className="border p-2">{packet.time}</td>
                <td className="border p-2">{packet.source_ip}</td>
                <td className="border p-2">{packet.destination_ip}</td>
                <td className="border p-2">{packet.protocol}</td>
                <td className="border p-2">{packet.length}</td>
                <td className="border p-2">{packet.source_port}</td>
                <td className="border p-2">{packet.dest_port}</td>
                <td className="border p-2">{packet.info}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mb-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={packets}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="count" 
              label={{ value: 'Packet Number', position: 'bottom' }} 
            />
            <YAxis 
              label={{ value: 'Packet Size (bytes)', angle: -90, position: 'left' }}
            />
            <Tooltip />
            <Line 
              type="monotone" 
              dataKey="length" 
              stroke="#8884d8" 
              dot={false} 
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Packet Rate (packets/s):
          </label>
          <input
            type="text"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            value={packetRate}
            readOnly
          />
        </div>

        {selectedPacket && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Packet Size:
              </label>
              <input
                type="text"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                value={selectedPacket.length}
                readOnly
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Source Port:
              </label>
              <input
                type="text"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                value={selectedPacket.source_port}
                readOnly
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Destination Port:
              </label>
              <input
                type="text"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                value={selectedPacket.dest_port}
                readOnly
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// FFT Implementation (since we can't use scipy in JavaScript)
class FFT {
  constructor(size) {
    this.size = size;
    this.reverseTable = new Uint32Array(size);
    this.sinTable = new Float64Array(size);
    this.cosTable = new Float64Array(size);
    this.initialize();
  }

  initialize() {
    // Initialize reverse table
    let limit = 1;
    let bit = this.size >> 1;

    while (limit < this.size) {
      for (let i = 0; i < limit; i++) {
        this.reverseTable[i + limit] = this.reverseTable[i] + bit;
      }
      limit = limit << 1;
      bit = bit >> 1;
    }

    // Initialize sin/cos tables
    for (let i = 0; i < this.size; i++) {
      this.sinTable[i] = Math.sin(-Math.PI / i);
      this.cosTable[i] = Math.cos(-Math.PI / i);
    }
  }

  forward(buffer) {
    const real = new Float64Array(buffer);
    const imag = new Float64Array(this.size);
    const size = this.size;

    // Bit reversal
    for (let i = 0; i < size; i++) {
      const rev = this.reverseTable[i];
      if (rev > i) {
        const temp = real[i];
        real[i] = real[rev];
        real[rev] = temp;
      }
    }

    // FFT computation
    for (let i = 2; i <= size; i <<= 1) {
      const step = size / i;
      const half = i >> 1;

      for (let j = 0; j < size; j += i) {
        for (let k = 0; k < half; k++) {
          const index1 = j + k;
          const index2 = index1 + half;
          const even_re = real[index1];
          const even_im = imag[index1];
          const odd_re = real[index2];
          const odd_im = imag[index2];

          const temp_re = odd_re * this.cosTable[step * k] - 
                         odd_im * this.sinTable[step * k];
          const temp_im = odd_re * this.sinTable[step * k] +
                         odd_im * this.cosTable[step * k];

          real[index2] = even_re - temp_re;
          imag[index2] = even_im - temp_im;
          real[index1] = even_re + temp_re;
          imag[index1] = even_im + temp_im;
        }
      }
    }

    // Combine real and imaginary parts into magnitude
    const magnitude = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      magnitude[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    }

    return magnitude;
  }
}

export default UDPMonitorApp;













// Import required React components and hooks
import React, { useState, useEffect, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { EventEmitter } from "events"; // Assuming Node.js EventEmitter
import _ from "lodash";

// PacketSignals class equivalent using EventEmitter
class PacketSignals extends EventEmitter {
  constructor() {
    super();
  }

  emitPacketReceived(data) {
    this.emit("packet_received", data);
  }
}

// PortAnalysisWindow Component
const PortAnalysisWindow = ({ portNumber, onClose }) => {
  const [timeData, setTimeData] = useState([]);
  const [amplitudeData, setAmplitudeData] = useState([]);
  const [amplitudeDataCh2, setAmplitudeDataCh2] = useState([]);
  const [activeTab, setActiveTab] = useState("intensity");
  const [measurements, setMeasurements] = useState({
    peakToPeakCh1: "N/A",
    peakToPeakCh2: "N/A",
    phaseDiff: "N/A",
  });

  const MAX_DATA_POINTS = 1000;
  const SAMPLE_RATE = 100;
  const startTime = useRef(Date.now());
  const lastUpdateTime = useRef(Date.now());

  useEffect(() => {
    const updateTimer = setInterval(() => {
      updatePlots();
    }, 50);     

    return () => clearInterval(updateTimer);
  }, []);

  const updatePlots = () => {
    const currentTime = Date.now();
    if (currentTime - lastUpdateTime.current >= 100) {
      updateData({}); // Replace with actual packet data when available
    }
  };

  const extractSignalFromPayload = (payload) => {
    try {
      if (typeof payload === "string") {
        // Clean payload and convert to bytes
        const cleanPayload = payload.replace(/[^0-9A-Fa-f]/g, "");
        const bytes = new Uint8Array(
          cleanPayload.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
        );

        if (bytes.length >= 4) {
          const view = new DataView(bytes.buffer);
          return view.getFloat32(0) / 32768.0;
        } else if (bytes.length >= 2) {
          const view = new DataView(bytes.buffer);
          return view.getInt16(0) / 32768.0;
        } else {
          return bytes[0] / 128.0;
        }
      }
    } catch (error) {
      console.error("Error extracting signal:", error);
    }
    return 0.0;
  };

  const updateData = (packetData) => {
    try {
      const currentTime = (Date.now() - startTime.current) / 1000;
      let signalValue;

      if (packetData.info && packetData.info !== "No Payload") {
        signalValue = extractSignalFromPayload(packetData.info);
      } else {
        signalValue = Math.sin(2 * Math.PI * 1.0 * currentTime);
      }

      setTimeData((prev) => [...prev.slice(-MAX_DATA_POINTS), currentTime]);
      setAmplitudeData((prev) => [...prev.slice(-MAX_DATA_POINTS), signalValue]);

      const phaseShift = Math.PI / 3;
      const signalValueCh2 =
        signalValue * Math.cos(2 * Math.PI * 1.0 * currentTime + phaseShift);
      setAmplitudeDataCh2((prev) =>
        [...prev.slice(-MAX_DATA_POINTS), signalValueCh2]
      );

      lastUpdateTime.current = Date.now();
    } catch (error) {
      console.error("Error updating data:", error);
    }
  };

  const IntensityPlot = () => {
    const data = timeData.map((time, index) => ({
      time,
      amplitude: amplitudeData[index],
    }));

    return (
      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" label={{ value: "Time (s)", position: "bottom" }} />
            <YAxis label={{ value: "Amplitude", angle: -90, position: "left" }} />
            <Tooltip />
            <Line type="monotone" dataKey="amplitude" stroke="#8884d8" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const TimeDomainPlot = () => {
    const data = timeData.map((time, index) => ({
      time,
      channel1: amplitudeData[index],
      channel2: amplitudeDataCh2[index],
    }));

    return (
      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" label={{ value: "Time (s)", position: "bottom" }} />
            <YAxis label={{ value: "Amplitude", angle: -90, position: "left" }} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="channel1"
              stroke="#8884d8"
              name="Channel 1"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="channel2"
              stroke="#82ca9d"
              name="Channel 2"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div className="w-full max-w-4xl p-4">
      <h2 className="text-xl font-bold mb-4">Port {portNumber} Analysis</h2>
      <div className="mb-4">
        <div className="flex space-x-4">
          <button
            className={`px-4 py-2 rounded ${
              activeTab === "intensity" ? "bg-blue-500 text-white" : "bg-gray-200"
            }`}
            onClick={() => setActiveTab("intensity")}
          >
            Intensity Plot
          </button>
          <button
            className={`px-4 py-2 rounded ${
              activeTab === "time" ? "bg-blue-500 text-white" : "bg-gray-200"
            }`}
            onClick={() => setActiveTab("time")}
          >
            Time Domain
          </button>
          <button
            className={`px-4 py-2 rounded ${
              activeTab === "frequency" ? "bg-blue-500 text-white" : "bg-gray-200"
            }`}
            onClick={() => setActiveTab("frequency")}
          >
            Frequency Domain
          </button>
        </div>
      </div>
      <div className="border rounded p-4">
        {activeTab === "intensity" && <IntensityPlot />}
        {activeTab === "time" && <TimeDomainPlot />}
      </div>
    </div>
  );
};

// Main UDP Monitor Application
const UDPMonitorApp = () => {
  const [packets, setPackets] = useState([]);
  const [packetRate, setPacketRate] = useState("0");

  const updatePacketRate = () => {
    console.log("Packet rate updated");
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">UDP Packet Monitor</h1>
    </div>
  );
};

export default UDPMonitorApp;
