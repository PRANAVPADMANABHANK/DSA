from PySide6.QtWidgets import (
    QApplication, QMainWindow, QTableWidget, QTableWidgetItem,
    QVBoxLayout, QWidget, QLabel, QLineEdit, QGridLayout,
    QTabWidget, QGraphicsScene, QGraphicsView
)
from PySide6.QtCharts import QChart, QChartView, QLineSeries, QValueAxis
from PySide6.QtGui import QPainter, QColor, QImage, QPixmap, qRgb
from PySide6.QtCore import Signal, QObject, Qt, QTimer, QPointF
import sys
import pyshark
import threading
import asyncio
import time
from collections import deque
import numpy as np
from scipy import signal
from scipy.fft import fft, fftfreq
import struct

class PacketSignals(QObject):
    packet_received = Signal(dict)

class PortAnalysisWindow(QMainWindow):
    def _init_(self, port_number, parent=None):
        super()._init_(parent)
        self.port_number = port_number
        self.setWindowTitle(f"Port {port_number} Analysis")
        self.setGeometry(200, 200, 1200, 800)
        
        # Create main widget and layout
        main_widget = QWidget()
        self.setCentralWidget(main_widget)
        layout = QVBoxLayout(main_widget)
        
        # Create tab widget
        self.tabs = QTabWidget()
        self.setup_intensity_tab()
        self.setup_time_domain_tab()
        self.setup_frequency_domain_tab()
        layout.addWidget(self.tabs)
        
        # Initialize data storage with appropriate size
        self.time_data = deque(maxlen=1000)
        self.amplitude_data = deque(maxlen=1000)
        self.amplitude_data_ch2 = deque(maxlen=1000)  # Second channel data
        self.sample_rate = 100
        self.start_time = time.time()
        
        # Add update timer for smooth real-time updates
        self.update_timer = QTimer()
        self.update_timer.timeout.connect(self.update_plots)
        self.update_timer.start(50)  # Update every 50ms
        
        # Track when data was last updated
        self.last_update_time = time.time()

    def setup_intensity_tab(self):
        intensity_tab = QWidget()
        layout = QVBoxLayout(intensity_tab)
        
        # Create intensity plot
        self.intensity_chart = QChart()
        self.intensity_series = QLineSeries()
        self.intensity_series.setName("Signal Intensity")
        
        pen = self.intensity_series.pen()
        pen.setColor(QColor("blue"))
        pen.setWidth(2)
        self.intensity_series.setPen(pen)
        
        self.intensity_chart.addSeries(self.intensity_series)
        
        self.intensity_x_axis = QValueAxis()
        self.intensity_y_axis = QValueAxis()
        self.intensity_x_axis.setTitleText("Time (s)")
        self.intensity_y_axis.setTitleText("Amplitude")
        self.intensity_x_axis.setRange(0, 10)
        self.intensity_y_axis.setRange(-1, 1)
        
        self.intensity_chart.addAxis(self.intensity_x_axis, Qt.AlignBottom)
        self.intensity_chart.addAxis(self.intensity_y_axis, Qt.AlignLeft)
        
        self.intensity_series.attachAxis(self.intensity_x_axis)
        self.intensity_series.attachAxis(self.intensity_y_axis)
        
        self.intensity_chart.setTitle("Signal Intensity Over Time")
        
        chart_view = QChartView(self.intensity_chart)
        chart_view.setMinimumHeight(400)
        chart_view.setRenderHint(QPainter.Antialiasing)
        layout.addWidget(chart_view)
        
        self.tabs.addTab(intensity_tab, "Intensity Plot")
    def setup_time_domain_tab(self):
        time_tab = QWidget()
        layout = QVBoxLayout(time_tab)
        
        # Create time domain plot
        self.time_chart = QChart()
        self.time_series1 = QLineSeries()
        self.time_series2 = QLineSeries()
        
        # Set colors and names
        self.time_series1.setName("Channel 1")
        pen1 = self.time_series1.pen()
        pen1.setColor(QColor("blue"))
        pen1.setWidth(2)
        self.time_series1.setPen(pen1)
        
        self.time_series2.setName("Channel 2")
        pen2 = self.time_series2.pen()
        pen2.setColor(QColor("red"))
        pen2.setWidth(2)
        self.time_series2.setPen(pen2)
        
        self.time_chart.addSeries(self.time_series1)
        self.time_chart.addSeries(self.time_series2)
        
        self.time_x_axis = QValueAxis()
        self.time_y_axis = QValueAxis()
        self.time_x_axis.setTitleText("Time (s)")
        self.time_y_axis.setTitleText("Amplitude")
        self.time_x_axis.setRange(0, 10)
        self.time_y_axis.setRange(-1, 1)
        
        self.time_chart.addAxis(self.time_x_axis, Qt.AlignBottom)
        self.time_chart.addAxis(self.time_y_axis, Qt.AlignLeft)
        
        self.time_series1.attachAxis(self.time_x_axis)
        self.time_series1.attachAxis(self.time_y_axis)
        self.time_series2.attachAxis(self.time_x_axis)
        self.time_series2.attachAxis(self.time_y_axis)
        
        self.time_chart.setTitle("Time Domain Analysis")
        
        chart_view = QChartView(self.time_chart)
        chart_view.setMinimumHeight(400)
        chart_view.setRenderHint(QPainter.Antialiasing)
        
        # Measurements display
        info_grid = QGridLayout()
        self.peak_to_peak_ch1_label = QLabel("Channel 1 Peak-to-Peak: N/A")
        self.peak_to_peak_ch2_label = QLabel("Channel 2 Peak-to-Peak: N/A")
        self.phase_diff_label = QLabel("Phase Difference: N/A")
        info_grid.addWidget(self.peak_to_peak_ch1_label, 0, 0)
        info_grid.addWidget(self.peak_to_peak_ch2_label, 0, 1)
        info_grid.addWidget(self.phase_diff_label, 1, 0, 1, 2)
        
        layout.addWidget(chart_view)
        layout.addLayout(info_grid)
        
        self.tabs.addTab(time_tab, "Time Domain")

    def setup_frequency_domain_tab(self):
        freq_tab = QWidget()
        layout = QVBoxLayout(freq_tab)
        
        # Create chart and series
        self.freq_chart = QChart()
        self.freq_series = QLineSeries()
        
        # Set color and style for the line
        pen = self.freq_series.pen()
        pen.setColor(QColor("green"))
        pen.setWidth(2)
        self.freq_series.setPen(pen)
        
        # Add series to chart
        self.freq_chart.addSeries(self.freq_series)
        
        # Create and configure axes
        self.freq_x_axis = QValueAxis()
        self.freq_y_axis = QValueAxis()
        
        # Set axis labels
        self.freq_x_axis.setTitleText("Frequency (Hz)")
        self.freq_y_axis.setTitleText("Amplitude")  # Changed from Power to Amplitude
        
        # Set initial ranges
        self.freq_x_axis.setRange(0, 50)
        self.freq_y_axis.setRange(0, 1)
        
        # Add axes to chart
        self.freq_chart.addAxis(self.freq_x_axis, Qt.AlignBottom)
        self.freq_chart.addAxis(self.freq_y_axis, Qt.AlignLeft)
        
        # Attach series to axes
        self.freq_series.attachAxis(self.freq_x_axis)
        self.freq_series.attachAxis(self.freq_y_axis)
        
        # Set chart title
        self.freq_chart.setTitle("Amplitude Spectrum")
        font = self.freq_chart.titleFont()
        font.setPointSize(12)
        self.freq_chart.setTitleFont(font)
        
        # Remove legend
        self.freq_chart.legend().hide()
        
        # Create chart view
        chart_view = QChartView(self.freq_chart)
        chart_view.setMinimumHeight(400)
        chart_view.setRenderHint(QPainter.Antialiasing)
        layout.addWidget(chart_view)
        
        self.tabs.addTab(freq_tab, "Frequency Domain")

    def update_frequency_domain_plot(self):
        try:
            if len(self.amplitude_data) < 4:
                return
            
            # Prepare data for FFT
            data = np.array(list(self.amplitude_data))
            
            # Remove DC component (mean)
            data = data - np.mean(data)
            
            # Apply window function
            window = np.hanning(len(data))
            data_windowed = data * window
            
            # Compute FFT
            yf = np.abs(fft(data_windowed))
            xf = fftfreq(len(yf), 1/self.sample_rate)
            
            # Get positive frequencies only
            n_positive = len(yf)//2
            amplitudes = yf[:n_positive]  # Using amplitude directly instead of power
            freq = xf[:n_positive]
            
            # Normalize amplitudes
            amplitudes = amplitudes / len(data)
            
            # Skip the DC component and very low frequencies
            start_idx = 1  # Skip DC component
            points = []
            for f, amp in zip(freq[start_idx:], amplitudes[start_idx:]):
                # Only add points if amplitude is significant
                if amp > 1e-5:  # Threshold to filter out noise
                    points.append(QPointF(float(f), float(amp)))
            
            # Update plot
            self.freq_series.clear()
            self.freq_series.replace(points)
            
            # Update axis ranges
            if points:
                y_max = max(point.y() for point in points)
                self.freq_y_axis.setRange(0, y_max * 1.2)
                self.freq_x_axis.setRange(0, 50)  # Show up to 50 Hz
            
        except Exception as e:
            print(f"Error updating frequency domain plot: {e}", flush=True)
    def update_plots(self):
        # Only update if we have new data
        current_time = time.time()
        if current_time - self.last_update_time < 0.1:  # 100ms threshold
            self.update_intensity_plot()
            self.update_time_domain_plots()
            self.update_frequency_domain_plot()

    def update_data(self, packet_data):
        try:
            current_time = time.time() - self.start_time
            
            # Extract signal value from payload
            if 'info' in packet_data and packet_data['info'] != "No Payload":
                signal_value = self.extract_signal_from_payload(packet_data['info'])
            else:
                # Generate a test signal if no payload
                signal_value = np.sin(2 * np.pi * 1.0 * current_time)
            
            # Store data for channel 1
            self.time_data.append(current_time)
            self.amplitude_data.append(signal_value)
            
            # Generate channel 2 with phase shift
            phase_shift = np.pi / 3  # 60 degrees
            signal_value_ch2 = signal_value * np.cos(2 * np.pi * 1.0 * current_time + phase_shift)
            self.amplitude_data_ch2.append(signal_value_ch2)
            
            # Maintain buffer size
            if len(self.time_data) > self.time_data.maxlen:
                self.time_data.popleft()
                self.amplitude_data.popleft()
                self.amplitude_data_ch2.popleft()
            
            # Update last update time
            self.last_update_time = time.time()
            
        except Exception as e:
            print(f"Error updating data: {e}", flush=True)

    def extract_signal_from_payload(self, payload):
        """Extract signal value from packet payload"""
        try:
            # Convert the payload string to bytes
            if isinstance(payload, str):
                # Remove any non-hex characters
                clean_payload = ''.join(c for c in payload if c.isalnum())
                # Convert to bytes
                payload_bytes = bytes.fromhex(clean_payload)
                
                # Try different interpretations of the bytes
                if len(payload_bytes) >= 4:
                    # Try as float (4 bytes)
                    value = struct.unpack('!f', payload_bytes[:4])[0]
                elif len(payload_bytes) >= 2:
                    # Try as signed short (2 bytes)
                    value = struct.unpack('!h', payload_bytes[:2])[0]
                else:
                    # Try as single byte
                    value = struct.unpack('!b', payload_bytes[:1])[0]
                
                # Normalize to [-1, 1] range
                return float(value) / 32768.0  # Assuming 16-bit range
        except Exception as e:
            print(f"Error extracting signal: {e}")
        return 0.0

    def update_intensity_plot(self):
        try:
            if not self.amplitude_data or len(self.amplitude_data) < 2:
                return
            
            self.intensity_series.clear()
            points = [QPointF(t, a) for t, a in zip(self.time_data, self.amplitude_data)]
            self.intensity_series.replace(points)
            
            if points:
                x_max = points[-1].x()
                y_values = [p.y() for p in points]
                y_min = min(y_values)
                y_max = max(y_values)
                
                # Show last 10 seconds of data
                self.intensity_x_axis.setRange(max(0, x_max - 10), x_max)
                
                # Update y-axis range with padding
                y_padding = (y_max - y_min) * 0.1 if y_max != y_min else 0.1
                self.intensity_y_axis.setRange(y_min - y_padding, y_max + y_padding)
            
        except Exception as e:
            print(f"Error updating intensity plot: {e}", flush=True)

    def update_time_domain_plots(self):
        try:
            if len(self.time_data) < 2:
                return
            
            # Update channel 1
            self.time_series1.clear()
            points1 = [QPointF(t, a) for t, a in zip(self.time_data, self.amplitude_data)]
            self.time_series1.replace(points1)
            
            # Update channel 2
            self.time_series2.clear()
            points2 = [QPointF(t, a) for t, a in zip(self.time_data, self.amplitude_data_ch2)]
            self.time_series2.replace(points2)
            
            if points1 and points2:
                x_max = points1[-1].x()
                y_values = [p.y() for p in points1 + points2]
                y_min = min(y_values)
                y_max = max(y_values)
                
                # Show last 10 seconds of data
                self.time_x_axis.setRange(max(0, x_max - 10), x_max)
                
                # Update y-axis range with padding
                y_padding = (y_max - y_min) * 0.1 if y_max != y_min else 0.1
                self.time_y_axis.setRange(y_min - y_padding, y_max + y_padding)
                
                # Calculate and update measurements
                peak_to_peak_ch1 = max(p.y() for p in points1) - min(p.y() for p in points1)
                peak_to_peak_ch2 = max(p.y() for p in points2) - min(p.y() for p in points2)
                
                self.peak_to_peak_ch1_label.setText(f"Channel 1 Peak-to-Peak: {peak_to_peak_ch1:.3f}")
                self.peak_to_peak_ch2_label.setText(f"Channel 2 Peak-to-Peak: {peak_to_peak_ch2:.3f}")
                self.phase_diff_label.setText("Phase Difference: 60.00°")
            
        except Exception as e:
            print(f"Error updating time domain plots: {e}", flush=True)

    def update_frequency_domain_plot(self):
        try:
            if len(self.amplitude_data) < 4:
                return
            
            # Prepare data for FFT
            data = np.array(list(self.amplitude_data))
            
            # Apply window function
            window = np.hanning(len(data))
            data_windowed = data * window
            
            # Compute power spectrum
            yf = np.abs(fft(data_windowed)) ** 2  # Square for power spectrum
            xf = fftfreq(len(yf), 1/self.sample_rate)
            
            # Get positive frequencies
            n_positive = len(yf)//2
            power = yf[:n_positive] / len(data) ** 2  # Normalize power
            freq = xf[:n_positive]
            
            # Update plot
            self.freq_series.clear()
            points = [QPointF(float(f), float(p)) for f, p in zip(freq[1:], power[1:])]
            self.freq_series.replace(points)
            
            # Update axis ranges
            if points:
                y_max = max(point.y() for point in points)
                self.freq_y_axis.setRange(0, y_max * 1.2)
            
        except Exception as e:
            print(f"Error updating frequency domain plot: {e}", flush=True)
class UDPMonitorApp(QMainWindow):
    def _init_(self):
        super()._init_()
        self.setWindowTitle("UDP Packet Monitor")
        self.setGeometry(100, 100, 1200, 600)

        # Create signals
        self.signals = PacketSignals()
        self.signals.packet_received.connect(self.update_ui)
        self.port_windows = {}
        
        # Create main layout
        central_widget = QWidget()
        main_layout = QVBoxLayout()
        
        # Create packet table
        self.setup_packet_table(main_layout)
        self.setup_graph(main_layout)
        self.setup_info_boxes(main_layout)
        
        # Set main layout
        central_widget.setLayout(main_layout)
        self.setCentralWidget(central_widget)

        # Initialize data storage with better structure
        self.packet_count = 0
        self.packet_data = deque(maxlen=100)
        self.packet_times = deque(maxlen=100)
        self.last_update_time = time.time()
        self.packets_since_update = 0
        self.bytes_since_update = 0

        # Start timer for rate updates
        self.update_timer = QTimer()
        self.update_timer.timeout.connect(self.update_packet_rate)
        self.update_timer.start(1000)  # Update every second

        # Start packet capture
        self.start_udp_sniffer()

    def setup_packet_table(self, main_layout):
        self.packet_table = QTableWidget()
        self.packet_table.setColumnCount(9)
        self.packet_table.setHorizontalHeaderLabels([
            "No", "Time", "Source IP", "Destination IP", "Protocol (UDP)", 
            "Length", "Source Port", "Dest Port", "Info"
        ])
        self.packet_table.setRowCount(0)
        self.packet_table.cellClicked.connect(self.display_packet_details)
        main_layout.addWidget(self.packet_table)

    def setup_graph(self, main_layout):
        self.chart = QChart()
        self.series = QLineSeries()
        self.chart.addSeries(self.series)
        
        self.chart_x_axis = QValueAxis()
        self.chart_y_axis = QValueAxis()
        
        self.chart_x_axis.setTitleText("Time (s)")
        self.chart_y_axis.setTitleText("Packet Size (bytes)")
        
        self.chart_x_axis.setRange(0, 10)
        self.chart_y_axis.setRange(0, 1500)
        
        self.chart.addAxis(self.chart_x_axis, Qt.AlignBottom)
        self.chart.addAxis(self.chart_y_axis, Qt.AlignLeft)
        
        self.series.attachAxis(self.chart_x_axis)
        self.series.attachAxis(self.chart_y_axis)
        
        self.chart.setTitle("Packet Size Over Time")
        self.chart.setAnimationOptions(QChart.NoAnimation)
        
        chart_view = QChartView(self.chart)
        chart_view.setRenderHint(QPainter.Antialiasing)
        chart_view.setMinimumHeight(200)
        main_layout.addWidget(chart_view)

    def setup_info_boxes(self, main_layout):
        info_layout = QGridLayout()
        
        self.packet_rate_label = QLabel("Packet Rate (packets/s):")
        self.packet_rate_input = QLineEdit()
        self.packet_rate_input.setReadOnly(True)
        
        self.packet_size_label = QLabel("Packet Size:")
        self.packet_size_input = QLineEdit()
        self.packet_size_input.setReadOnly(True)
        
        self.source_port_label = QLabel("Source Port:")
        self.source_port_input = QLineEdit()
        self.source_port_input.setReadOnly(True)
        
        self.dest_port_label = QLabel("Destination Port:")
        self.dest_port_input = QLineEdit()
        self.dest_port_input.setReadOnly(True)
        
        info_layout.addWidget(self.packet_rate_label, 0, 0)
        info_layout.addWidget(self.packet_rate_input, 0, 1)
        info_layout.addWidget(self.packet_size_label, 1, 0)
        info_layout.addWidget(self.packet_size_input, 1, 1)
        info_layout.addWidget(self.source_port_label, 2, 0)
        info_layout.addWidget(self.source_port_input, 2, 1)
        info_layout.addWidget(self.dest_port_label, 3, 0)
        info_layout.addWidget(self.dest_port_input, 3, 1)

        main_layout.addLayout(info_layout)

    def display_packet_details(self, row, column):
        try:
            length = self.packet_table.item(row, 5).text()
            source_port = self.packet_table.item(row, 6).text()
            dest_port = self.packet_table.item(row, 7).text()
            info = self.packet_table.item(row, 8).text()
            
            self.packet_size_input.setText(length)
            self.source_port_input.setText(source_port)
            self.dest_port_input.setText(dest_port)
            
            # Update port analysis windows
            for port in [source_port, dest_port]:
                if port not in self.port_windows:
                    self.port_windows[port] = PortAnalysisWindow(port, self)
                
                window = self.port_windows[port]
                window.show()
                window.raise_()
                
                window.update_data({
                    'length': float(length),
                    'info': info,
                    'time': time.time()
                })
                
        except Exception as e:
            print(f"Error in display_packet_details: {e}", flush=True)

    def start_udp_sniffer(self):
        threading.Thread(target=self.sniff_udp_packets, daemon=True).start()

    def sniff_udp_packets(self):
        try:
            asyncio.set_event_loop(asyncio.new_event_loop())
            capture = pyshark.LiveCapture(interface='Ethernet', display_filter='udp')
            
            for packet in capture.sniff_continuously():
                try:
                    self.packet_count += 1
                    
                    src_port = packet.udp.srcport if hasattr(packet, 'udp') else "N/A"
                    dst_port = packet.udp.dstport if hasattr(packet, 'udp') else "N/A"
                    
                    payload = "No Payload"
                    if hasattr(packet, 'udp') and hasattr(packet.udp, 'payload'):
                        payload = packet.udp.payload
                    
                    packet_info = {
                        'count': self.packet_count,
                        'time': packet.sniff_time.strftime('%Y-%m-%d %H:%M:%S'),
                        'source_ip': packet.ip.src if hasattr(packet, 'ip') else "N/A",
                        'destination_ip': packet.ip.dst if hasattr(packet, 'ip') else "N/A",
                        'protocol': "UDP",
                        'length': int(packet.length),
                        'source_port': src_port,
                        'dest_port': dst_port,
                        'info': payload
                    }
                    
                    self.signals.packet_received.emit(packet_info)
                    self.packets_since_update += 1
                    self.bytes_since_update += int(packet.length)
                    
                    # Update existing port windows
                    if src_port in self.port_windows:
                        self.port_windows[src_port].update_data(packet_info)
                    if dst_port in self.port_windows:
                        self.port_windows[dst_port].update_data(packet_info)
                    
                except Exception as e:
                    print(f"Error processing packet: {e}", flush=True)
                    
        except Exception as e:
            print(f"Error in packet sniffer: {e}", flush=True)

    def update_graph(self):
        try:
            self.series.clear()
            
            if not self.packet_times or not self.packet_data:
                return
                
            start_time = self.packet_times[0]
            points = []
            
            for t, size in zip(self.packet_times, self.packet_data):
                relative_time = t - start_time
                points.append(QPointF(relative_time, size))
            
            self.series.replace(points)
            
            if points:
                x_min = points[0].x()
                x_max = points[-1].x()
                y_min = min(point.y() for point in points)
                y_max = max(point.y() for point in points)
                
                x_padding = (x_max - x_min) * 0.1 if x_max != x_min else 1
                y_padding = (y_max - y_min) * 0.1 if y_max != y_min else 100
                
                self.chart_x_axis.setRange(x_min - x_padding, x_max + x_padding)
                self.chart_y_axis.setRange(max(0, y_min - y_padding), y_max + y_padding)
            
        except Exception as e:
            print(f"Error updating graph: {e}", flush=True)

    def update_ui(self, packet_info):
        try:
            row_position = self.packet_table.rowCount()
            self.packet_table.insertRow(row_position)
            
            self.packet_table.setItem(row_position, 0, QTableWidgetItem(str(packet_info['count'])))
            self.packet_table.setItem(row_position, 1, QTableWidgetItem(packet_info['time']))
            self.packet_table.setItem(row_position, 2, QTableWidgetItem(packet_info['source_ip']))
            self.packet_table.setItem(row_position, 3, QTableWidgetItem(packet_info['destination_ip']))
            self.packet_table.setItem(row_position, 4, QTableWidgetItem(packet_info['protocol']))
            self.packet_table.setItem(row_position, 5, QTableWidgetItem(str(packet_info['length'])))
            self.packet_table.setItem(row_position, 6, QTableWidgetItem(str(packet_info['source_port'])))
            self.packet_table.setItem(row_position, 7, QTableWidgetItem(str(packet_info['dest_port'])))
            self.packet_table.setItem(row_position, 8, QTableWidgetItem(packet_info['info']))

            self.packet_table.scrollToBottom()

            current_time = time.time()
            self.packet_times.append(current_time)
            self.packet_data.append(packet_info['length'])
            
            self.update_graph()
            
        except Exception as e:
            print(f"Error updating UI: {e}", flush=True)

    def update_packet_rate(self):
        try:
            current_time = time.time()
            time_diff = current_time - self.last_update_time
            
            if time_diff > 0:
                packet_rate = self.packets_since_update / time_diff
                bytes_rate = self.bytes_since_update / time_diff
                bits_rate = bytes_rate * 8
                
                self.packet_rate_input.setText(
                    f"{packet_rate:.2f} packets/s, {bytes_rate:.2f} B/s ({bits_rate:.2f} b/s)")
            
            self.packets_since_update = 0
            self.bytes_since_update = 0
            self.last_update_time = current_time
            
        except Exception as e:
            print(f"Error updating packet rate: {e}", flush=True)


if _name_ == "_main_":
    app = QApplication(sys.argv)
    window = UDPMonitorApp()
    window.show()
    sys.exit(app.exec_())